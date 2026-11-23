/**
 * Paywall screen — unlock SplitCue Pro with a one-time lifetime purchase.
 *
 * Sells the result, not the features:
 *   "Hit your target pace. Nail every interval.
 *    Know exactly how you performed."
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscription } from '../src/contexts/SubscriptionContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../src/constants/theme';

// ── Feature comparison rows ─────────────────────────────────

type FeatureRow = {
  label: string;
  free: string;  // checkmark, text, or dash
  pro: string;
};

const FEATURE_ROWS: FeatureRow[] = [
  { label: 'Unlimited runs', free: '✓', pro: '✓' },
  { label: 'Build custom workouts', free: '✓', pro: '✓' },
  { label: 'Audio interval announcements', free: '✓', pro: '✓' },
  { label: 'GPS recording and route maps', free: '✓', pro: '✓' },
  { label: 'Full workout history and calendar', free: '✓', pro: '✓' },
  { label: 'Basic splits, pace and HR data', free: '✓', pro: '✓' },
  { label: 'Advanced live pace guidance', free: 'Trial / limited', pro: 'Unlimited' },
  { label: 'Personalized audio feedback', free: 'Trial / limited', pro: 'Unlimited' },
  { label: 'Advanced HR and interval analysis', free: 'Trial / limited', pro: 'Unlimited' },
  { label: 'Advanced workout comparisons', free: '—', pro: '✓' },
];

// ── Outcome-driven value props ──────────────────────────────

const VALUE_PROPS = [
  { icon: 'speedometer-outline' as const, text: 'Hit your target pace' },
  { icon: 'pulse-outline' as const, text: 'Nail every interval' },
  { icon: 'analytics-outline' as const, text: 'Know exactly how you performed' },
  { icon: 'trending-up-outline' as const, text: 'See yourself getting faster' },
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    tier,
    isInTrial,
    trialRunsRemaining,
    completedRunCount,
    isGrandfathered,
    lifetimePackage,
    offeringsLoading,
    purchasePackage,
    restorePurchases,
  } = useSubscription();

  const [loading, setLoading] = useState<'purchase' | 'restore' | null>(null);

  // Dev fallback price when StoreKit isn't available
  const priceString = lifetimePackage?.product.priceString ?? (__DEV__ ? '$24.99' : null);

  const handlePurchase = async () => {
    if (!lifetimePackage) {
      if (__DEV__) {
        Alert.alert(
          'Dev Mode',
          'Simulated lifetime purchase. Use a production build to test real IAP.',
        );
        return;
      }
      Alert.alert('Error', 'No purchase option available.');
      return;
    }
    setLoading('purchase');
    const { error } = await purchasePackage(lifetimePackage);
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
      Alert.alert('Restored', 'SplitCue Pro has been restored. Enjoy!');
      router.back();
    }
  };

  // Already Pro (purchased or grandfathered)
  if (tier === 'pro') {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
          <Text style={styles.activeTitle}>You're on SplitCue Pro</Text>
          <Text style={styles.activeSubtitle}>
            {isGrandfathered
              ? 'Early supporter — Pro forever. Thank you!'
              : 'Your best workout, every workout. Forever.'}
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

      {/* Header — sell the result */}
      <Text style={styles.header}>SplitCue Pro</Text>
      <Text style={styles.tagline}>Your best workout, every workout.</Text>

      {/* Outcome-driven value props */}
      <View style={styles.valueProps}>
        {VALUE_PROPS.map((vp) => (
          <View key={vp.text} style={styles.valuePropRow}>
            <Ionicons name={vp.icon} size={22} color={Colors.primary} />
            <Text style={styles.valuePropText}>{vp.text}</Text>
          </View>
        ))}
      </View>

      {/* Price card */}
      {!offeringsLoading && priceString && (
        <View style={styles.priceCard}>
          <Text style={styles.priceAmount}>{priceString}</Text>
          <Text style={styles.priceLabel}>One-time purchase</Text>
        </View>
      )}
      {offeringsLoading && (
        <ActivityIndicator
          color={Colors.primary}
          style={{ marginVertical: Spacing.lg }}
        />
      )}

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
          <Text style={styles.purchaseButtonText}>
            Unlock Pro{priceString ? ` — ${priceString}` : ''}
          </Text>
        )}
      </TouchableOpacity>

      {/* Trust line */}
      <Text style={styles.trustLine}>
        No subscription. No recurring charges. Yours forever.
      </Text>

      {/* Trial context */}
      <View style={styles.trialCard}>
        <Ionicons
          name={isInTrial ? 'gift-outline' : 'checkmark-circle-outline'}
          size={20}
          color={Colors.primary}
        />
        <View style={{ flex: 1 }}>
          {isInTrial ? (
            <>
              <Text style={styles.trialTitle}>
                Try Pro for your first {trialRunsRemaining === 5 ? '5' : `remaining ${trialRunsRemaining}`} completed workouts
              </Text>
              <Text style={styles.trialText}>
                No payment information required. Your workout history remains yours, even if you never upgrade.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.trialTitle}>
                Your 5 premium runs are complete
              </Text>
              <Text style={styles.trialText}>
                You still get 1 free advanced analysis each week. Your workout history remains yours, even if you never upgrade.
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Feature comparison table */}
      <Text style={styles.comparisonHeader}>SplitCue capability</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderLabel, { flex: 2 }]} />
        <Text style={styles.tableHeaderLabel}>Free</Text>
        <Text style={[styles.tableHeaderLabel, styles.tableHeaderPro]}>Pro</Text>
      </View>
      {FEATURE_ROWS.map((row) => (
        <View key={row.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { flex: 2 }]}>{row.label}</Text>
          <Text style={[styles.tableCell, styles.tableCellCenter, row.free === '✓' && styles.checkmark]}>
            {row.free === '✓' ? '✓' : row.free}
          </Text>
          <Text style={[styles.tableCell, styles.tableCellCenter, styles.tableCellPro, row.pro === '✓' && styles.checkmarkPro]}>
            {row.pro === '✓' ? '✓' : row.pro}
          </Text>
        </View>
      ))}

      {/* Restore + legal */}
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

        <Text style={styles.legalText}>
          By purchasing, you agree to our{' '}
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

  // ── Header ─────────────────────────────
  header: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.primary,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  tagline: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },

  // ── Value props ────────────────────────
  valueProps: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  valuePropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  valuePropText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  // ── Price card ─────────────────────────
  priceCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  priceAmount: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.primary,
  },
  priceLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ── Purchase button ────────────────────
  purchaseButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: Colors.black,
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  trustLine: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },

  // ── Trial card ─────────────────────────
  trialCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  trialTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  trialText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // ── Feature comparison table ───────────
  comparisonHeader: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight,
  },
  tableHeaderLabel: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  tableHeaderPro: {
    color: Colors.primary,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  tableCell: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  tableCellCenter: {
    textAlign: 'center',
  },
  tableCellPro: {
    color: Colors.textPrimary,
  },
  checkmark: {
    color: Colors.textMuted,
  },
  checkmarkPro: {
    color: Colors.primary,
    fontWeight: '600',
  },

  // ── Footer ─────────────────────────────
  footer: {
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  restoreText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
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

  // ── Already Pro ────────────────────────
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
