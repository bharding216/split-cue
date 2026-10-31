/**
 * Entry point for the create-plan flow. Free users who already used their
 * one AI plan are told up front instead of after filling out the whole form.
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSubscription } from '../contexts/SubscriptionContext';
import { track } from '../analytics/track';

export function useStartPlanCreation() {
  const router = useRouter();
  const { canGeneratePlan, loading } = useSubscription();

  return useCallback(() => {
    // While the subscription is still loading, let them in — setup re-checks before generating
    if (loading || canGeneratePlan) {
      router.push('/(tabs)/training/setup' as any);
      return;
    }

    track('plan_limit_prompt_shown');
    Alert.alert(
      'Free Plan Already Used',
      "You've already created your free AI training plan. Upgrade to Pro for unlimited plans that adapt to your progress.",
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'See Pro', onPress: () => router.push('/paywall' as any) },
      ],
    );
  }, [loading, canGeneratePlan, router]);
}
