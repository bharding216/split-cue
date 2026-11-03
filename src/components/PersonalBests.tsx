/**
 * Personal bests, records, and awards display components.
 *
 * Three main exports:
 *   - RecordsGrid: grid of personal record cards (fastest mile, longest run, etc.)
 *   - AwardsList: earned awards/badges in a scrollable row
 *   - NewRecordsBanner: celebratory banner for records broken in the latest workout
 *   - PrimaryAchievement: a single headline achievement for the workout-complete screen
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { PersonalRecord, AwardBadge } from '../stats/personalRecords';
import { useUnits } from '../hooks/useUnits';
import { distanceUnitName, toDisplayDistance } from '../units/format';

// ── Tier colors ──────────────────────────────────────────────────────

const TIER_COLORS = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
} as const;

// ── Records Grid ─────────────────────────────────────────────────────

interface RecordsGridProps {
  records: PersonalRecord[];
}

export function RecordsGrid({ records }: RecordsGridProps) {
  if (records.length === 0) return null;

  return (
    <View style={gridStyles.container}>
      <View style={gridStyles.header}>
        <Ionicons name="trophy" size={16} color={Colors.primary} />
        <Text style={gridStyles.title}>Personal Records</Text>
      </View>
      <View style={gridStyles.grid}>
        {records.map((record) => (
          <View key={record.category} style={gridStyles.card}>
            <Ionicons
              name={record.icon as any}
              size={20}
              color={Colors.primary}
              style={gridStyles.cardIcon}
            />
            <Text style={gridStyles.cardLabel} numberOfLines={1}>
              {record.label}
            </Text>
            <View style={gridStyles.cardValueRow}>
              <Text style={gridStyles.cardValue}>
                {record.displayValue}
              </Text>
              {record.unit ? (
                <Text style={gridStyles.cardUnit}>{record.unit}</Text>
              ) : null}
            </View>
            <Text style={gridStyles.cardDate} numberOfLines={1}>
              {record.workoutName}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  card: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  cardIcon: {
    marginBottom: Spacing.xs,
  },
  cardLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  cardValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cardUnit: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  cardDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
});

// ── Awards List ──────────────────────────────────────────────────────

interface AwardsListProps {
  awards: AwardBadge[];
}

export function AwardsList({ awards }: AwardsListProps) {
  if (awards.length === 0) return null;

  return (
    <View style={awardStyles.container}>
      <View style={awardStyles.header}>
        <Ionicons name="medal" size={16} color={Colors.warning} />
        <Text style={awardStyles.title}>Awards & Milestones</Text>
        <Text style={awardStyles.count}>{awards.length}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={awardStyles.scroll}
      >
        {awards.map((award) => (
          <View
            key={award.id}
            style={[
              awardStyles.badge,
              { borderColor: TIER_COLORS[award.tier] + '66' },
            ]}
          >
            <View
              style={[
                awardStyles.iconCircle,
                { backgroundColor: TIER_COLORS[award.tier] + '22' },
              ]}
            >
              <Ionicons
                name={award.icon as any}
                size={18}
                color={TIER_COLORS[award.tier]}
              />
            </View>
            <Text style={awardStyles.badgeLabel} numberOfLines={1}>
              {award.label}
            </Text>
            <Text style={awardStyles.badgeDesc} numberOfLines={2}>
              {award.description}
            </Text>
            <Text style={awardStyles.badgeDate}>
              {new Date(award.earnedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const awardStyles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    flex: 1,
  },
  count: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  scroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  badge: {
    width: 140,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  badgeLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  badgeDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  badgeDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    fontWeight: '600',
  },
});

// ── Primary Achievement (workout-complete headline) ──────────────────

const TIER_RANK = { gold: 3, silver: 2, bronze: 1 } as const;

interface PrimaryAchievementProps {
  records: PersonalRecord[];
  awards: AwardBadge[];
}

/**
 * Shows one achievement even when several were earned, so each one still
 * feels special. Records beat awards; among awards the highest tier wins.
 */
export function PrimaryAchievement({ records, awards }: PrimaryAchievementProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  const total = records.length + awards.length;

  useEffect(() => {
    if (total === 0) return;
    opacity.value = withTiming(1, { duration: 350 });
    scale.value = withSpring(1, { damping: 12, stiffness: 140 });
  }, [total, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (total === 0) return null;

  const record = records[0];
  const award = record
    ? null
    : [...awards].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0];
  const more = total - 1;

  return (
    <Animated.View style={[primaryStyles.container, animatedStyle]}>
      <Text style={primaryStyles.headline}>
        {record ? '🏆 NEW PERSONAL BEST!' : '🎖️ AWARD EARNED!'}
      </Text>
      {record ? (
        <Text style={primaryStyles.detail}>
          {record.label} · {record.displayValue}
          {record.unit ? record.unit : ''}
        </Text>
      ) : award ? (
        <Text style={primaryStyles.detail}>{award.label}</Text>
      ) : null}
      {more > 0 && (
        <Text style={primaryStyles.more}>+{more} more in workout details</Text>
      )}
    </Animated.View>
  );
}

const primaryStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headline: {
    fontSize: FontSize.xl,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  detail: {
    marginTop: Spacing.xs,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  more: {
    marginTop: 2,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});

// ── New Records Banner (post-workout celebration) ────────────────────

interface NewRecordsBannerProps {
  records: PersonalRecord[];
  awards: AwardBadge[];
}

export function NewRecordsBanner({ records, awards }: NewRecordsBannerProps) {
  if (records.length === 0 && awards.length === 0) return null;

  return (
    <View style={bannerStyles.container}>
      {records.length > 0 && (
        <View style={bannerStyles.section}>
          <View style={bannerStyles.headerRow}>
            <Text style={bannerStyles.emoji}>🏆</Text>
            <Text style={bannerStyles.headerText}>
              New Personal {records.length === 1 ? 'Record' : 'Records'}!
            </Text>
          </View>
          {records.map((r) => (
            <View key={r.category} style={bannerStyles.recordRow}>
              <Ionicons name={r.icon as any} size={16} color={Colors.primary} />
              <Text style={bannerStyles.recordLabel}>{r.label}</Text>
              <Text style={bannerStyles.recordValue}>
                {r.displayValue}
                {r.unit ? r.unit : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {awards.length > 0 && (
        <View style={bannerStyles.section}>
          <View style={bannerStyles.headerRow}>
            <Text style={bannerStyles.emoji}>🎖️</Text>
            <Text style={bannerStyles.headerText}>
              {awards.length === 1 ? 'Award' : 'Awards'} Earned!
            </Text>
          </View>
          {awards.map((a) => (
            <View key={a.id} style={bannerStyles.awardRow}>
              <View
                style={[
                  bannerStyles.awardDot,
                  { backgroundColor: TIER_COLORS[a.tier] },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={bannerStyles.awardLabel}>{a.label}</Text>
                <Text style={bannerStyles.awardDesc}>{a.description}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: Spacing.sm,
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary + '33',
    overflow: 'hidden',
  },
  section: {
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  emoji: {
    fontSize: 20,
  },
  headerText: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    color: Colors.primary,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  recordLabel: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  recordValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  awardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  awardDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  awardLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  awardDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
});

// ── Lifetime Stats Summary ───────────────────────────────────────────

interface LifetimeStatsProps {
  totalWorkouts: number;
  totalDistanceMeters: number;
  totalDurationMs: number;
}

export function LifetimeStats({
  totalWorkouts,
  totalDistanceMeters,
  totalDurationMs,
}: LifetimeStatsProps) {
  const unit = useUnits();
  const distance = toDisplayDistance(totalDistanceMeters, unit);
  const hours = totalDurationMs / 3600000;

  return (
    <View style={lifeStyles.container}>
      <StatPill
        icon="footsteps-outline"
        label="Workouts"
        value={totalWorkouts.toString()}
      />
      <StatPill
        icon="map-outline"
        label={distanceUnitName(unit)}
        value={distance >= 100 ? Math.round(distance).toString() : distance.toFixed(1)}
      />
      <StatPill
        icon="time-outline"
        label="Hours"
        value={hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1)}
      />
    </View>
  );
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={lifeStyles.pill}>
      <Ionicons name={icon as any} size={16} color={Colors.accent} />
      <Text style={lifeStyles.pillValue}>{value}</Text>
      <Text style={lifeStyles.pillLabel}>{label}</Text>
    </View>
  );
}

const lifeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    gap: 2,
  },
  pillValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  pillLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
