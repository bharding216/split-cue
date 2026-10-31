/**
 * Subscription & AI usage context for SplitCue Pro.
 *
 * Uses RevenueCat for IAP management and Supabase for server-side
 * subscription state + AI usage tracking.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  EXTERNAL SETUP REQUIRED — see SETUP.md                │
 * │                                                        │
 * │  1. Create RevenueCat project + iOS/Android apps       │
 * │  2. Create subscription products in App Store Connect   │
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
} from 'react';
import { Platform, Alert, Linking } from 'react-native';
import Purchases, {
  PurchasesPackage,
  PurchasesOfferings,
} from 'react-native-purchases';
import { useAuth } from './AuthContext';
import { supabase } from '../analytics/supabaseClient';
import {
  Subscription,
  SubscriptionTier,
  FREE_TIER_AI_WORKOUTS,
} from '../types/database';

// ┌─────────────────────────────────────────────────────────┐
// │  PLACEHOLDER: Set your RevenueCat public API key in     │
// │  .env as EXPO_PUBLIC_REVENUE_CAT_KEY                    │
// └─────────────────────────────────────────────────────────┘
const REVENUE_CAT_KEY = process.env.EXPO_PUBLIC_REVENUE_CAT_KEY ?? '';

const ENTITLEMENT_ID = 'pacecue_pro';

type SubscriptionContextType = {
  subscription: Subscription | null;
  tier: SubscriptionTier;
  aiWorkoutsUsed: number;
  aiWorkoutsLimit: number | null;
  canUseAI: boolean;
  canGeneratePlan: boolean;
  /** Number of AI-generated training plans the user has created (excludes custom plans). */
  planCount: number;
  loading: boolean;
  offerings: PurchasesOfferings | null;
  offeringsLoading: boolean;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ error: Error | null }>;
  restorePurchases: () => Promise<{ error: Error | null }>;
  refreshSubscription: () => Promise<void>;
  manageSubscription: () => void;
  incrementAIUsage: (workoutId: string, workoutName: string) => Promise<void>;
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
  const [aiWorkoutsUsed, setAiWorkoutsUsed] = useState(0);
  const [planCount, setPlanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rcInitialized, setRcInitialized] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [devOverrideTier, setDevOverrideTier] = useState<SubscriptionTier | null>(null);

  // ─── Initialize RevenueCat ────────────────────────────────
  // Skip entirely in dev — the native SDK auto-fetches offerings
  // after configure/logIn and errors when no StoreKit products
  // exist, which can't be silenced via setLogLevel.

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
    // RevenueCat is never initialized in dev or without a key, so there's nothing to wait for
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

  // ─── Load subscription from Supabase ─────────────────────

  const refreshSubscription = useCallback(async () => {
    console.log('[SubscriptionContext] refreshSubscription called, user:', user?.id ?? 'null');

    if (!user) {
      setSubscription(null);
      setAiWorkoutsUsed(0);
      setPlanCount(0);
      setLoading(false);
      return;
    }

    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Use .maybeSingle() for tables where the row may not exist yet
      // (.single() throws when zero rows are found, which crashes the
      // entire Promise.all and silently leaves aiWorkoutsUsed at 0).
      const [subResult, profileResult, genResult, planCountResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('ai_workouts_this_month')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('ai_generations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', startOfMonth.toISOString()),
        supabase
          .from('training_plans')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .neq('race_type', 'custom'),
      ]);

      console.log('[SubscriptionContext] subResult:', JSON.stringify({ data: subResult.data, error: subResult.error }));
      console.log('[SubscriptionContext] profileResult:', JSON.stringify({ data: profileResult.data, error: profileResult.error }));
      console.log('[SubscriptionContext] genResult:', JSON.stringify({ count: genResult.count, error: genResult.error }));
      console.log('[SubscriptionContext] planCountResult:', JSON.stringify({ count: planCountResult.count, error: planCountResult.error }));

      const counterValue = profileResult.data?.ai_workouts_this_month ?? 0;
      const generationsValue = genResult.count ?? 0;
      const finalUsage = Math.max(counterValue, generationsValue);

      console.log('[SubscriptionContext] counterValue:', counterValue, 'generationsValue:', generationsValue, 'finalUsage:', finalUsage);

      setSubscription(subResult.data);
      setAiWorkoutsUsed(finalUsage);
      setPlanCount(planCountResult.count ?? 0);
    } catch (err) {
      console.warn('[SubscriptionContext] refreshSubscription CRASHED:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // ─── Derived state ────────────────────────────────────────

  const tier: SubscriptionTier =
    __DEV__ && devOverrideTier != null
      ? devOverrideTier
      : getEffectiveTier(subscription);

  const aiWorkoutsLimit =
    tier === 'free' ? FREE_TIER_AI_WORKOUTS : null;

  const canUseAI =
    tier === 'pro' || aiWorkoutsUsed < FREE_TIER_AI_WORKOUTS;

  // First AI plan is free for all users; additional plans require Pro
  const canGeneratePlan = tier === 'pro' || planCount === 0;

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
          'Purchase completed but subscription wasn\'t activated. ' +
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
        error: new Error('No active SplitCue Pro subscription found.'),
      };
    } catch (err: any) {
      return { error: err };
    }
  };

  // ─── Manage subscription ──────────────────────────────────

  const manageSubscription = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      Linking.openURL(
        'https://play.google.com/store/account/subscriptions',
      );
    }
  };

  // ─── Increment AI usage ───────────────────────────────────

  const incrementAIUsage = useCallback(
    async (workoutId: string, workoutName: string) => {
      if (!user) return;

      // Insert a durable record into ai_generations — this is the
      // source of truth that survives sign-out / sign-in cycles.
      await supabase.from('ai_generations').insert({
        user_id: user.id,
        prompt: workoutName,
        result: { workout_id: workoutId },
      });

      // Best-effort update of the counter on profiles (backward compat)
      supabase
        .rpc('increment_ai_workouts', { p_user_id: user.id })
        .then(null, () => {});

      setAiWorkoutsUsed((prev) => prev + 1);
    },
    [user],
  );

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        tier,
        aiWorkoutsUsed,
        aiWorkoutsLimit,
        canUseAI,
        canGeneratePlan,
        planCount,
        loading,
        offerings,
        offeringsLoading,
        purchasePackage,
        restorePurchases,
        refreshSubscription,
        manageSubscription,
        incrementAIUsage,
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

function getEffectiveTier(sub: Subscription | null): SubscriptionTier {
  if (!sub) return 'free';

  if (sub.tier === 'pro' && sub.status === 'active') return 'pro';

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
