/**
 * Subscription context for SplitCue Pro.
 *
 * Uses RevenueCat for IAP management and Supabase for server-side
 * subscription state + training plan counts.
 *
 * RevenueCat is the primary source of truth for purchase state: when the
 * RC SDK says the entitlement is active, the user is treated as Pro even
 * if the Supabase row hasn't caught up (webhook delay/failure).  A
 * background reconciliation call keeps Supabase in sync.
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
  useRef,
} from 'react';
import { Platform, Alert, Linking } from 'react-native';
import Purchases, {
  PurchasesPackage,
  PurchasesOfferings,
  CustomerInfo,
} from 'react-native-purchases';
import { useAuth } from './AuthContext';
import { supabase } from '../analytics/supabaseClient';
import {
  Subscription,
  SubscriptionTier,
} from '../types/database';

// ┌─────────────────────────────────────────────────────────┐
// │  PLACEHOLDER: Set your RevenueCat public API key in     │
// │  .env as EXPO_PUBLIC_REVENUE_CAT_KEY                    │
// └─────────────────────────────────────────────────────────┘
const REVENUE_CAT_KEY = process.env.EXPO_PUBLIC_REVENUE_CAT_KEY ?? '';

const ENTITLEMENT_ID = 'pacecue_pro';

/** Delays (ms) for background Supabase retries after a purchase/restore. */
const RECONCILE_DELAYS = [1500, 4000, 10000];

type SubscriptionContextType = {
  subscription: Subscription | null;
  tier: SubscriptionTier;
  canGeneratePlan: boolean;
  /** Number of AI-generated training plans the user has ever created, including deleted ones. */
  planCount: number;
  loading: boolean;
  offerings: PurchasesOfferings | null;
  offeringsLoading: boolean;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ error: Error | null }>;
  restorePurchases: () => Promise<{ error: Error | null }>;
  refreshSubscription: () => Promise<void>;
  manageSubscription: () => void;
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

  // RevenueCat entitlement — secondary source of truth
  const [rcEntitlementActive, setRcEntitlementActive] = useState(false);

  // Track in-flight reconciliation to avoid duplicate calls
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ─── Check RevenueCat entitlement ───────────────────────
  const checkRcEntitlement = useCallback(async (info?: CustomerInfo): Promise<boolean> => {
    try {
      const customerInfo = info ?? await Purchases.getCustomerInfo();
      const active = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
      setRcEntitlementActive(active);
      return active;
    } catch (err) {
      console.warn('[SubscriptionContext] RC getCustomerInfo failed:', err);
      return false;
    }
  }, []);

  // ─── Background reconciliation ─────────────────────────
  // When RC says active but Supabase has no Pro row, call the
  // reconcile-subscription edge function so server-side is in sync.
  const triggerReconcile = useCallback(async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.functions.invoke('reconcile-subscription', {
        body: { user_id: user.id },
      });
    } catch (err) {
      console.warn('[SubscriptionContext] reconcile-subscription failed:', err);
    }
  }, [user]);

  // ─── Load subscription from Supabase ─────────────────────

  const refreshSubscription = useCallback(async () => {
    console.log('[SubscriptionContext] refreshSubscription called, user:', user?.id ?? 'null');

    if (!user) {
      setSubscription(null);
      setPlanCount(0);
      setRcEntitlementActive(false);
      setLoading(false);
      return;
    }

    try {
      // Fetch Supabase data and RC entitlement in parallel
      const rcPromise = rcInitialized
        ? checkRcEntitlement()
        : Promise.resolve(false);

      // .maybeSingle() because the subscription row may not exist yet
      // (.single() throws on zero rows, which would fail the Promise.all).
      const [subResult, planCountResult, rcActive] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        // Counted from the generation ledger, not training_plans, so deleting a plan can't reset the quota.
        supabase
          .from('plan_generations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
        rcPromise,
      ]);

      console.log('[SubscriptionContext] subResult:', JSON.stringify({ data: subResult.data, error: subResult.error }));
      console.log('[SubscriptionContext] planCountResult:', JSON.stringify({ count: planCountResult.count, error: planCountResult.error }));

      setSubscription(subResult.data);
      setPlanCount(planCountResult.count ?? 0);

      // If RC says active but Supabase has no Pro row, trigger reconciliation
      const supabasePro = subResult.data?.tier === 'pro' && subResult.data?.status === 'active';
      if (rcActive && !supabasePro) {
        console.warn(
          '[SubscriptionContext] RC entitlement active but Supabase row missing/stale — reconciling',
        );
        triggerReconcile();
      }
    } catch (err) {
      console.warn('[SubscriptionContext] refreshSubscription CRASHED:', err);
    } finally {
      setLoading(false);
    }
  }, [user, rcInitialized, checkRcEntitlement, triggerReconcile]);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  // ─── Derived state ────────────────────────────────────────

  const tier: SubscriptionTier =
    __DEV__ && devOverrideTier != null
      ? devOverrideTier
      : rcEntitlementActive
        ? 'pro'
        : getEffectiveTier(subscription);

  // First AI plan is free for all users; additional plans require Pro
  const canGeneratePlan = tier === 'pro' || planCount === 0;

  // ─── Background Supabase retries after purchase/restore ──
  // Gives the webhook time to land, then reconciles if it hasn't.
  const scheduleReconcileRetries = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);

    let attempt = 0;
    const retry = () => {
      if (attempt >= RECONCILE_DELAYS.length) return;
      reconcileTimer.current = setTimeout(async () => {
        await refreshSubscription();
        attempt++;
        retry();
      }, RECONCILE_DELAYS[attempt]);
    };
    retry();
  }, [refreshSubscription]);

  // Clean up reconcile timer on unmount
  useEffect(() => {
    return () => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    };
  }, []);

  // ─── Purchase ─────────────────────────────────────────────

  const purchasePackage = async (
    pkg: PurchasesPackage,
  ): Promise<{ error: Error | null }> => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);

      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        // Immediately mark as Pro from RC — don't wait for the webhook
        setRcEntitlementActive(true);
        // Kick off Supabase refresh + reconciliation in background
        scheduleReconcileRetries();
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
        // Immediately mark as Pro from RC — don't wait for the webhook
        setRcEntitlementActive(true);
        // Kick off Supabase refresh + reconciliation in background
        scheduleReconcileRetries();
        return { error: null };
      }

      // RC didn't find the entitlement — the purchase may be under a
      // different RC anonymous user ID.  Try server-side reconciliation
      // which checks RevenueCat's REST API directly.
      if (user) {
        try {
          const { data } = await supabase.functions.invoke('reconcile-subscription', {
            body: { user_id: user.id },
          });
          if (data?.tier === 'pro') {
            setRcEntitlementActive(true);
            await refreshSubscription();
            return { error: null };
          }
        } catch {
          // Fall through to original error
        }
      }

      return {
        error: new Error(
          'No SplitCue Pro purchase found on this account. ' +
            'If you purchased with a different Apple ID, sign in with that account ' +
            'in Settings → Apple ID, then try again. Otherwise contact support.',
        ),
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

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        tier,
        canGeneratePlan,
        planCount,
        loading,
        offerings,
        offeringsLoading,
        purchasePackage,
        restorePurchases,
        refreshSubscription,
        manageSubscription,
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
