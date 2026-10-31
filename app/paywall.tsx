/**
 * Paywall screen — upgrade to SplitCue Pro.
 *
 * Shows plan options (monthly / annual), feature comparison,
 * and purchase buttons. Presented as a modal.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { PACKAGE_TYPE } from 'react-native-purchases';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscription } from '../src/contexts/SubscriptionContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../src/constants/theme';

const FEATURES_FREE = [
  'Unlimited workouts & intervals',
  'Full pace tracking',
  '1 AI training plan',
  'Cloud sync',
];

const FEATURES_PRO = [
  'Unlimited AI training plans',
  'Plans adapt to your performance',
  'Unlimited cloud history',
  'Priority support',
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    tier,
    planCount,
    offerings,
    offeringsLoading,
    purchasePackage,
    restorePurchases,
  } = useSubscription();

  const [loading, setLoading] = useState<'purchase' | 'restore' | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');

  const monthlyPkg = offerings?.current?.availablePackages?.find(
    (p) => p.packageType === PACKAGE_TYPE.MONTHLY,
  );
  const annualPkg = offerings?.current?.availablePackages?.find(
    (p) => p.packageType === PACKAGE_TYPE.ANNUAL,
  );

  // Dev fallbacks when StoreKit isn't available
  type PlanDisplay = { priceString: string; price: number } | null;
  const devMonthly: PlanDisplay = __DEV__ && !monthlyPkg
    ? { priceString: '$3.99', price: 3.99 }
    : null;
  const devAnnual: PlanDisplay = __DEV__ && !annualPkg
    ? { priceString: '$29.99', price: 29.99 }
    : null;

  const showMonthly: PlanDisplay = monthlyPkg
    ? { priceString: monthlyPkg.product.priceString, price: monthlyPkg.product.price }
    : devMonthly;
  const showAnnual: PlanDisplay = annualPkg
    ? { priceString: annualPkg.product.priceString, price: annualPkg.product.price }
    : devAnnual;

  const handlePurchase = async () => {
    const pkg = selectedPlan === 'annual' ? annualPkg : monthlyPkg;
    if (!pkg) {
      if (__DEV__) {
        Alert.alert(
          'Dev Mode',
          `Simulated ${selectedPlan} purchase. Use a production build to test real IAP.`,
        );
        return;
      }
      Alert.alert('Error', 'No subscription package available.');
      return;
    }
    setLoading('purchase');
    const { error } = await purchasePackage(pkg);
    setLoading(null);
    if (error) {
      Alert.alert('Purchase Failed', error.message);
    } else {
      router.back();
    }
  };

  const handleRestore = async () => {
    setLoading('restore');
    const { error } = await restorePurchases();
    setLoading(null);
    if (error) {
      Alert.alert('Restore', error.message);
    } else {
      Alert.alert('Restored', 'Your SplitCue Pro subscription has been restored.');
      router.back();
    }
  };

  // Already subscribed
  if (tier === 'pro') {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
          <Text style={styles.activeTitle}>You're on SplitCue Pro</Text>
          <Text style={styles.activeSubtitle}>
            Unlimited AI training plans and all premium features.
          </Text>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + Spacing.xl * 2 },
      ]}
    >
      {/* Close button */}
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => router.back()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={28} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Header */}
      <Text style={styles.header}>SplitCue Pro</Text>
      <Text style={styles.headerSub}>AI training plans that adapt to you</Text>

      {/* Plan selector */}
      {!offeringsLoading && (showMonthly || showAnnual) && (
        <View style={styles.planSelector}>
          {showAnnual && (
            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'annual' && styles.planCardSelected,
              ]}
              onPress={() => setSelectedPlan('annual')}
              activeOpacity={0.8}
            >
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>Best Value</Text>
              </View>
              <Text
                style={[
                  styles.planLabel,
                  selectedPlan === 'annual' && styles.planLabelSelected,
                ]}
              >
                Annual
              </Text>
              <Text
                style={[
                  styles.planPrice,
                  selectedPlan === 'annual' && styles.planPriceSelected,
                ]}
              >
                {showAnnual.priceString}/yr
              </Text>
              {showMonthly && (
                <Text
                  style={[
                    styles.planSavings,
                    selectedPlan === 'annual' && styles.planSavingsSelected,
                  ]}
                >
                  {`$${(showAnnual.price / 12).toFixed(2)}/mo`}
                </Text>
              )}
            </TouchableOpacity>
          )}
          {showMonthly && (
            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'monthly' && styles.planCardSelected,
              ]}
              onPress={() => setSelectedPlan('monthly')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.planLabel,
                  selectedPlan === 'monthly' && styles.planLabelSelected,
                ]}
              >
                Monthly
              </Text>
              <Text
                style={[
                  styles.planPrice,
                  selectedPlan === 'monthly' && styles.planPriceSelected,
                ]}
              >
                {showMonthly.priceString}/mo
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {offeringsLoading && (
        <ActivityIndicator
          color={Colors.primary}
          style={{ marginVertical: Spacing.lg }}
        />
      )}

      {/* Usage context */}
      {tier === 'free' && (
        <View style={styles.usageCard}>
          <Ionicons
            name={planCount >= 1 ? 'checkmark-circle' : 'gift-outline'}
            size={22}
            color={Colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.usageTitle}>
              {planCount >= 1
                ? "You've used your free AI training plan"
                : 'Your first AI training plan is on us'}
            </Text>
            <Text style={styles.usageText}>
              {planCount >= 1
                ? 'Go Pro to build a plan for every goal ahead, each one shaped around your schedule and adapting as you train.'
                : 'Build it free. Go Pro whenever you want plans for every goal ahead.'}
            </Text>
          </View>
        </View>
      )}

      {/* Feature comparison */}
      <View style={styles.comparisonContainer}>
        <View style={styles.tierColumn}>
          <Text style={styles.tierLabel}>Free</Text>
          {FEATURES_FREE.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons
                name="checkmark"
                size={16}
                color={Colors.textMuted}
              />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.tierColumn, styles.tierColumnPro]}>
          <Text style={styles.tierLabelPro}>Pro</Text>
          {FEATURES_FREE.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons
                name="checkmark"
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.featureTextPro}>
                {f.replace('1 AI training plan', 'Unlimited AI plans')}
              </Text>
            </View>
          ))}
          {FEATURES_PRO.filter((f) => f !== 'Unlimited AI training plans').map(
            (f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={Colors.primary}
                />
                <Text style={styles.featureTextPro}>{f}</Text>
              </View>
            ),
          )}
        </View>
      </View>

      {/* Purchase button */}
      <TouchableOpacity
        style={[
          styles.purchaseButton,
          loading === 'purchase' && styles.buttonDisabled,
        ]}
        onPress={handlePurchase}
        disabled={loading != null}
        activeOpacity={0.8}
      >
        {loading === 'purchase' ? (
          <ActivityIndicator color={Colors.black} />
        ) : (
          <Text style={styles.purchaseButtonText}>Subscribe</Text>
        )}
      </TouchableOpacity>

      {/* Restore + terms */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleRestore}
          disabled={loading != null}
          activeOpacity={0.6}
        >
          <Text style={styles.restoreText}>
            {loading === 'restore' ? 'Restoring…' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          Payment will be charged to your Apple ID at confirmation of purchase.
          Subscription automatically renews unless canceled at least 24 hours
          before the end of the current period.
        </Text>

        <Text style={styles.legalText}>
          By subscribing, you agree to our{' '}
          <Text
            style={styles.legalLink}
            onPress={() =>
              Linking.openURL('https://www.brandonharding.dev/pacecue/terms')
            }
          >
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text
            style={styles.legalLink}
            onPress={() =>
              Linking.openURL('https://www.brandonharding.dev/pacecue/privacy')
            }
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10,
  },
  header: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.primary,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  headerSub: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  planSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  planCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  planBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.black,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  planLabelSelected: {
    color: Colors.textPrimary,
  },
  planPrice: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  planPriceSelected: {
    color: Colors.primary,
  },
  planSavings: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  planSavingsSelected: {
    color: Colors.textSecondary,
  },
  usageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  usageTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  usageText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  comparisonContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  tierColumn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  tierColumnPro: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  tierLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  tierLabelPro: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  featureText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    flex: 1,
  },
  featureTextPro: {
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    flex: 1,
  },
  purchaseButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: Colors.black,
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  restoreText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  legalText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  activeTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  activeSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl * 2,
  },
  doneButtonText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
