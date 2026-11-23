/**
 * Subscription context for SplitCue Pro — lifetime purchase model.
 *
 * Uses RevenueCat for IAP management and Supabase for server-side
 * subscription state, trial tracking, weekly analysis, and grandfathering.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  EXTERNAL SETUP REQUIRED — see SETUP.md                │
 * │                                                        │
 * │  1. Create RevenueCat project + iOS/Android apps       │
 * │  2. Create lifetime IAP product in App Store Connect   │
 * │  3. Set EXPO_PUBLIC_REVENUE_CAT_KEY in .env            │
 * │  4. Create "pacecue_pro" entitlement in RevenueCat     │
 * │  5. Set up RevenueCat webhook → Supabase edge function │
 * └─────────────────────────────────────────────────────────┘
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { Platform, Alert } from 'react-native';
import Purchases, {
  PurchasesPackage,
  PurchasesOfferings,
  PACKAGE_TYPE,
} from 'react-native-purchases';
import { useAuth } from './AuthContext';
import { supabase } from '../analytics/supabaseClient';
import {
  Subscription,
  SubscriptionTier,
} from '../types/database';

const REVENUE_CAT_KEY = process.env.EXPO_PUBLIC_REVENUE_CAT_KEY ?? '';

const ENTITLEMENT_ID = 'pacecue_pro';

/** Number of fully completed runs with Pro features before the trial ends. */
const TRIAL_RUN_LIMIT = 5;

type SubscriptionContextType = {
  subscription: Subscription | null;
  tier: SubscriptionTier;

  // Plan generation gating (kept for backward compat)
  canGeneratePlan: boolean;
  planCount: number;

  // Trial state
  isInTrial: boolean;
  trialRunsRemaining: number;
  completedRunCount: number;
  incrementTrialCount: () => Promise<void>;

  // Weekly analysis allowance (post-trial free users)
  weeklyAnalysisAvailable: boolean;
  weeklyAnalysisUsedThisWeek: number;
  recordWeeklyAnalysisUsed: (runId: string) => Promise<void>;

  // Convenience: true if Pro OR in trial OR weekly analysis available
  hasAdvancedAccess: boolean;
  // Execution-only: true if Pro OR in trial (no weekly allowance)
  hasAdvancedExecution: boolean;

  // Grandfathering
  isGrandfathered: boolean;

  // RevenueCat offerings
  loading: boolean;
  offerings: PurchasesOfferings | null;
  offeringsLoading: boolean;
  lifetimePackage: PurchasesPackage | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ error: Error | null }>;
  restorePurchases: () => Promise<{ error: Error | null }>;
  refreshSubscription: () => Promise<void>;

  /** DEV ONLY: override the effective tier without a real subscription. */
  devOverrideTier: SubscriptionTier | null;
  setDevOverrideTier: (tier: SubscriptionTier | null) => void;
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(
  undefined,
);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [planCount, setPlanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rcInitialized, setRcInitialized] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [devOverrideTier, setDevOverrideTier] = useState<SubscriptionTier | null>(null);

  // Trial tracking
  const [completedRunCount, setCompletedRunCount] = useState(0);

  // Weekly analysis
  const [weeklyAnalysisUsedThisWeek, setWeeklyAnalysisUsedThisWeek] = useState(0);

  // Grandfathering
  const [grandfatherCutoffDate, setGrandfatherCutoffDate] = useState<string | null>(null);
  const grandfatherCutoffFetched = useRef(false);

  // ─── Initialize RevenueCat ────────────────────────────────
  useEffect(() => {
    if (__DEV__ || !REVENUE_CAT_KEY || rcInitialized) return;

    const initRC = async () => {
      try {
        Purchases.configure({ apiKey: REVENUE_CAT_KEY });
        setRcInitialized(true);
      } catch (err) {
        console.warn('RevenueCat init failed:', err);
        setOfferingsLoading(false);
      }
    };

    initRC();
  }, [rcInitialized]);

  // ─── Identify user in RevenueCat ──────────────────────────
  useEffect(() => {
    if (!user || !rcInitialized) return;

    Purchases.logIn(user.id).catch((err) => {
      console.warn('RevenueCat logIn failed:', err);
    });

    return () => {
      Purchases.logOut().catch(() => {});
    };
  }, [user?.id, rcInitialized]);

  // ─── Load offerings ───────────────────────────────────────
  useEffect(() => {
    if (__DEV__ || !REVENUE_CAT_KEY) {
      setOfferingsLoading(false);
      return;
    }
    if (!rcInitialized) return;

    const loadOfferings = async () => {
      try {
        setOfferingsLoading(true);
        const off = await Purchases.getOfferings();
        setOfferings(off);
      } catch (err) {
        console.warn('Failed to load offerings:', err);
      } finally {
        setOfferingsLoading(false);
      }
    };

    loadOfferings();
  }, [rcInitialized]);

  // ─── Fetch grandfather cutoff date (once) ──────────────────
  useEffect(() => {
    if (grandfatherCutoffFetched.current) return;
    grandfatherCutoffFetched.current = true;

    supabase
      .from('app_config')
      .select('value')
      .eq('key', 'grandfather_cutoff_date')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && typeof data.value === 'string') {
          setGrandfatherCutoffDate(data.value);
        }
      })
      .catch(() => {});
  }, []);

  // ─── Load subscription + trial + weekly from Supabase ─────
  const refreshSubscription = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setPlanCount(0);
      setCompletedRunCount(0);
      setWeeklyAnalysisUsedThisWeek(0);
      setLoading(false);
      return;
    }

    try {
      const [subResult, planCountResult, trialResult, weeklyResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('plan_generations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('trial_tracking')
          .select('completed_run_count')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('weekly_analysis_usage')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('used_at', getWeekStart()),
      ]);

      setSubscription(subResult.data);
      setPlanCount(planCountResult.count ?? 0);
      setCompletedRunCount(trialResult.data?.completed_run_count ?? 0);
      setWeeklyAnalysisUsedThisWeek(weeklyResult.count ?? 0);
    } catch (err) {
      console.warn('[SubscriptionContext] refreshSubscription CRASHED:', err);
    } finally {
      setLoading(false);
    }
  }, [user, rcInitialized]);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // ─── Derived state ────────────────────────────────────────

  const isGrandfathered =
    grandfatherCutoffDate != null &&
    user?.created_at != null &&
    new Date(user.created_at) < new Date(grandfatherCutoffDate);

  const tier: SubscriptionTier =
    __DEV__ && devOverrideTier != null
      ? devOverrideTier
      : isGrandfathered
        ? 'pro'
        : getEffectiveTier(subscription);

  const isInTrial = tier !== 'pro' && completedRunCount < TRIAL_RUN_LIMIT;
  const trialRunsRemaining = Math.max(0, TRIAL_RUN_LIMIT - completedRunCount);

  const weeklyAnalysisAvailable = tier !== 'pro' && !isInTrial && weeklyAnalysisUsedThisWeek < 1;

  const hasAdvancedExecution = tier === 'pro' || isInTrial;
  const hasAdvancedAccess = tier === 'pro' || isInTrial || weeklyAnalysisAvailable;

  const canGeneratePlan = tier === 'pro' || planCount === 0;

  // ─── Lifetime package ─────────────────────────────────────

  const lifetimePackage = offerings?.current?.availablePackages?.find(
    (p) => p.packageType === PACKAGE_TYPE.LIFETIME,
  ) ?? null;

  // ─── Purchase ─────────────────────────────────────────────

  const purchasePackage = async (
    pkg: PurchasesPackage,
  ): Promise<{ error: Error | null }> => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);

      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        await refreshSubscription();
        return { error: null };
      }

      return {
        error: new Error(
          'Purchase completed but Pro wasn\'t activated. ' +
            'Please tap "Restore Purchases" or contact support.',
        ),
      };
    } catch (err: any) {
      if (err.userCancelled) {
        return { error: null };
      }
      return { error: err };
    }
  };

  // ─── Restore ──────────────────────────────────────────────

  const restorePurchases = async (): Promise<{ error: Error | null }> => {
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        await refreshSubscription();
        return { error: null };
      }

      return {
        error: new Error('No SplitCue Pro purchase found.'),
      };
    } catch (err: any) {
      return { error: err };
    }
  };

  // ─── Trial tracking ──────────────────────────────────────

  const incrementTrialCount = useCallback(async () => {
    if (!user) return;

    const nextCount = completedRunCount + 1;

    // Optimistic local update
    setCompletedRunCount(nextCount);

    try {
      await supabase
        .from('trial_tracking')
        .upsert(
          { user_id: user.id, completed_run_count: nextCount },
          { onConflict: 'user_id' },
        );
    } catch (err) {
      console.warn('Failed to increment trial count:', err);
    }
  }, [user, completedRunCount]);

  // ─── Weekly analysis ──────────────────────────────────────

  const recordWeeklyAnalysisUsed = useCallback(async (runId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('weekly_analysis_usage')
        .insert({ user_id: user.id, run_id: runId });

      setWeeklyAnalysisUsedThisWeek((prev) => prev + 1);
    } catch (err) {
      console.warn('Failed to record weekly analysis usage:', err);
    }
  }, [user]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        tier,
        canGeneratePlan,
        planCount,
        isInTrial,
        trialRunsRemaining,
        completedRunCount,
        incrementTrialCount,
        weeklyAnalysisAvailable,
        weeklyAnalysisUsedThisWeek,
        recordWeeklyAnalysisUsed,
        hasAdvancedAccess,
        hasAdvancedExecution,
        isGrandfathered,
        loading,
        offerings,
        offeringsLoading,
        lifetimePackage,
        purchasePackage,
        restorePurchases,
        refreshSubscription,
        devOverrideTier,
        setDevOverrideTier,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error(
      'useSubscription must be used within a SubscriptionProvider',
    );
  }
  return context;
}

// ─── Helpers ──────────────────────────────────────────────────

function getEffectiveTier(sub: Subscription | null): SubscriptionTier {
  if (!sub) return 'free';

  // Lifetime or active subscription
  if (sub.tier === 'pro' && sub.status === 'active') return 'pro';

  // Legacy subscription grace periods (backward compat for existing subscribers)
  if (
    sub.status === 'trialing' &&
    sub.trial_ends_at &&
    new Date(sub.trial_ends_at) > new Date()
  ) {
    return 'pro';
  }

  if (
    sub.status === 'canceled' &&
    sub.current_period_end &&
    new Date(sub.current_period_end) > new Date()
  ) {
    return 'pro';
  }

  return 'free';
}

/** ISO string for the start of the current week (Monday 00:00 UTC). */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}
