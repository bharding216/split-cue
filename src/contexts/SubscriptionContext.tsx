/**
 * Subscription context for SplitCue Pro.
 *
 * Uses RevenueCat for IAP management and Supabase for server-side
 * subscription state + training plan counts.
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
      setPlanCount(0);
      setLoading(false);
      return;
    }

    try {
      // .maybeSingle() because the subscription row may not exist yet
      // (.single() throws on zero rows, which would fail the Promise.all).
      const [subResult, planCountResult] = await Promise.all([
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
      ]);

      console.log('[SubscriptionContext] subResult:', JSON.stringify({ data: subResult.data, error: subResult.error }));
      console.log('[SubscriptionContext] planCountResult:', JSON.stringify({ count: planCountResult.count, error: planCountResult.error }));

      setSubscription(subResult.data);
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
