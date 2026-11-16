/**
 * ShareCard — the branded image attached to shares and used for link
 * previews. Fixed size so captures look the same on every device.
 *
 * Variants:
 *  - performance:  time, distance, pace, with splits or the workout shape
 *  - route:        the route outline (ends trimmed) with compact stats
 *  - intervals:    each work rep against its target, with a consistency score
 *  - achievement:  one big number for a record or milestone
 */

import React, { useMemo, type Ref } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, intervalColor } from '../constants/theme';
import {
  flattenWorkout,
  formatTime,
  type FlatInterval,
  type IntervalSplit,
} from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { formatDistance, formatPaceValue, metersPerUnit, paceSuffix } from '../units/format';
import {
  formatPlannedDate,
  formatWorkoutSummary,
  resultOf,
  resultPaceMinPerMile,
  type ShareSubject,
} from '../sharing/shareText';
import { routeToSvgPath, trimRouteForPrivacy } from '../sharing/routeOutline';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '../sharing/shareCardImage';
import type { IntervalConsistency } from '../stats/intervalConsistency';

export type ShareCardVariant = 'performance' | 'route' | 'intervals' | 'achievement';

interface ShareCardProps {
  ref?: Ref<View>;
  subject: ShareSubject;
  paceUnit: PaceUnit;
  /** Shown in the footer; omitted when the runner hides their name. */
  senderName?: string;
  showResult: boolean;
  showSplits: boolean;
  showRoute: boolean;
  /** e.g. "New PR · Fastest Mile 7:02". */
  badge?: string;
  variant?: ShareCardVariant;
  /** Required by the intervals variant. */
  consistency?: IntervalConsistency | null;
}

const PAD = 24;
const VISUAL_WIDTH = SHARE_CARD_WIDTH - PAD * 2;
const VISUAL_HEIGHT = 96;
const ROUTE_HEIGHT = 190;
const REP_BARS_HEIGHT = 120;

/** Weight for drawing intervals to scale; distance intervals assume ~10 min/mile. */
function intervalWeight(interval: FlatInterval): number {
  if (interval.durationSeconds > 0) return interval.durationSeconds;
  if (interval.distanceMeters) return interval.distanceMeters * 0.37;
  return 60;
}

/** Seconds per mile in the runner's unit, as "7:02". */
function formatSecPerMile(secPerMile: number, unit: PaceUnit): string {
  return formatPaceValue(secPerMile / 60, unit);
}

function IntervalStrip({ intervals }: { intervals: FlatInterval[] }) {
  const total = intervals.reduce((s, i) => s + intervalWeight(i), 0);
  if (total <= 0) return null;
  return (
    <View style={styles.strip}>
      {intervals.slice(0, 80).map((interval, i) => (
        <View
          key={i}
          style={{
            flexGrow: intervalWeight(interval) / total,
            flexBasis: 0,
            backgroundColor: intervalColor(interval.type),
            height: interval.type === 'hard' ? 40 : 24,
            borderRadius: 3,
          }}
        />
      ))}
    </View>
  );
}

function SplitBars({ splits }: { splits: IntervalSplit[] }) {
  const paces = splits.map((s) => s.avgPaceMinPerMile).filter((p): p is number => p != null && isFinite(p) && p > 0);
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const shown = splits.slice(0, 40);
  return (
    <View style={styles.bars}>
      {shown.map((split, i) => {
        const pace = split.avgPaceMinPerMile;
        // Faster splits stand taller.
        const ratio =
          pace != null && isFinite(pace) && max > min ? 0.3 + (0.7 * (max - pace)) / (max - min) : 0.6;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: VISUAL_HEIGHT * ratio,
              backgroundColor: intervalColor(split.type),
              borderRadius: 3,
            }}
          />
        );
      })}
    </View>
  );
}

/** One bar per work rep (faster stands taller), with a marker at the target or average pace. */
function RepPaceBars({ consistency }: { consistency: IntervalConsistency }) {
  const { repPaces, targetPaces } = consistency;
  const mean = repPaces.reduce((s, p) => s + p, 0) / repPaces.length;
  const references = targetPaces ?? repPaces.map(() => mean);
  const all = [...repPaces, ...references];
  // Keep a little range so a perfectly even session doesn't divide by zero.
  const slowest = Math.max(...all) + 5;
  const fastest = Math.min(...all) - 5;
  const heightFor = (pace: number) => REP_BARS_HEIGHT * (0.25 + (0.75 * (slowest - pace)) / (slowest - fastest));
  const shown = repPaces.slice(0, 24);

  return (
    <View style={styles.repBars}>
      {shown.map((pace, i) => {
        const deviation = Math.abs(pace - references[i]);
        const color = deviation <= 5 ? Colors.primary : deviation <= 15 ? Colors.warning : Colors.danger;
        return (
          <View key={i} style={styles.repColumn}>
            <View style={[styles.repTarget, { bottom: heightFor(references[i]) }]} />
            <View style={{ height: heightFor(pace), backgroundColor: color, borderRadius: 3 }} />
          </View>
        );
      })}
    </View>
  );
}

function RouteOutline({ path, height }: { path: string; height: number }) {
  return (
    <Svg width={VISUAL_WIDTH} height={height}>
      <Path d={path} stroke={Colors.primary} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Stat({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <View style={large ? styles.statLarge : styles.stat}>
      <Text style={large ? styles.statValueLarge : styles.statValue} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>
        {value}
      </Text>
      <Text style={styles.statLabel} allowFontScaling={false}>{label}</Text>
    </View>
  );
}

export function ShareCard({
  ref,
  subject,
  paceUnit,
  senderName,
  showResult,
  showSplits,
  showRoute,
  badge,
  variant = 'performance',
  consistency,
}: ShareCardProps) {
  const { kind, workout, run, achievement } = subject;
  const intervals = useMemo(() => (workout ? flattenWorkout(workout) : []), [workout]);
  const result = run && showResult ? resultOf(run) : null;
  const pace = result ? resultPaceMinPerMile(result) : null;

  const wantsRoute = showRoute || variant === 'route';
  const routeHeight = variant === 'route' ? ROUTE_HEIGHT : VISUAL_HEIGHT;
  const routePath = useMemo(() => {
    if (!wantsRoute || !run?.route) return '';
    return routeToSvgPath(trimRouteForPrivacy(run.route), VISUAL_WIDTH, routeHeight, 6);
  }, [wantsRoute, run?.route, routeHeight]);

  const splits = showSplits && result && run?.splits && run.splits.length > 1 ? run.splits : null;

  const shown: ShareCardVariant =
    variant === 'achievement' && achievement
      ? 'achievement'
      : variant === 'intervals' && consistency && result
        ? 'intervals'
        : variant === 'route' && routePath && result
          ? 'route'
          : 'performance';

  const eyebrow =
    kind === 'planned' && subject.plannedDate
      ? formatPlannedDate(subject.plannedDate)
      : run
        ? new Date(run.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Workout';

  const callToAction =
    kind === 'challenge'
      ? subject.replyTo
        ? 'Your move.'
        : subject.challengeType === 'consistency'
          ? 'Can you match my consistency?'
          : 'Can you beat it?'
      : kind === 'planned'
        ? 'Run it with me.'
        : kind === 'structure'
          ? 'Try it with me.'
          : null;

  const timeValue = result ? formatTime(Math.floor(result.durationMs / 1000)) : null;
  const compactStats = result ? (
    <View style={styles.statRow}>
      <Stat label="Time" value={timeValue!} />
      {result.distanceMeters ? <Stat label="Distance" value={formatDistance(result.distanceMeters, paceUnit)} /> : null}
      {pace != null ? <Stat label={`Pace${paceSuffix(paceUnit)}`} value={formatPaceValue(pace, paceUnit)} /> : null}
    </View>
  ) : null;

  let body: React.ReactNode;
  let visual: React.ReactNode = null;

  if (shown === 'achievement' && achievement) {
    body = (
      <View style={styles.achievement}>
        <Text style={styles.achievementValue} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>
          {achievement.value}
        </Text>
        <Text style={styles.achievementLabel} numberOfLines={2} allowFontScaling={false}>{achievement.label}</Text>
        <Text style={styles.achievementMessage} numberOfLines={2} allowFontScaling={false}>{achievement.message}</Text>
        {achievement.totals?.length ? (
          <View style={[styles.statRow, styles.achievementTotals]}>
            {achievement.totals.slice(0, 3).map((t) => (
              <Stat key={t.label} label={t.label} value={t.value} />
            ))}
          </View>
        ) : null}
      </View>
    );
  } else if (shown === 'intervals' && consistency) {
    const reps = consistency.repPaces.length;
    const fade = consistency.fadeSec;
    // fadeSec is per mile; show it in the runner's unit.
    const fadeInUnit = Math.round(Math.abs(fade) * (metersPerUnit(paceUnit) / metersPerUnit('minPerMile')));
    body = (
      <View style={styles.stats}>
        <View style={styles.consistencyRow}>
          <Stat large label="Consistency" value={`${consistency.score}`} />
          <View style={styles.consistencyMeta}>
            <Text style={styles.consistencyMetaText} allowFontScaling={false}>
              {reps} reps · ±{Math.round(consistency.avgDeviationSec * (metersPerUnit(paceUnit) / metersPerUnit('minPerMile')))}s{paceSuffix(paceUnit)}
            </Text>
            <Text style={styles.consistencyMetaText} allowFontScaling={false}>
              {consistency.basis === 'target' ? 'vs target pace' : 'vs your average'}
              {fadeInUnit >= 3 ? ` · ${fade > 0 ? 'faded' : 'built'} ${fadeInUnit}s` : ' · even splits'}
            </Text>
          </View>
        </View>
        {compactStats}
      </View>
    );
    visual = <RepPaceBars consistency={consistency} />;
  } else if (shown === 'route') {
    body = <View style={styles.stats}>{compactStats}</View>;
    visual = <RouteOutline path={routePath} height={ROUTE_HEIGHT} />;
  } else {
    body = result ? (
      <View style={styles.stats}>
        <Stat large label="Time" value={timeValue!} />
        <View style={styles.statRow}>
          {result.distanceMeters ? (
            <Stat label="Distance" value={formatDistance(result.distanceMeters, paceUnit)} />
          ) : null}
          {pace != null ? (
            <Stat label={`Pace${paceSuffix(paceUnit)}`} value={formatPaceValue(pace, paceUnit)} />
          ) : null}
        </View>
      </View>
    ) : workout ? (
      <Text style={styles.summary} allowFontScaling={false}>{formatWorkoutSummary(workout)}</Text>
    ) : null;
    visual = showRoute && routePath ? (
      <RouteOutline path={routePath} height={VISUAL_HEIGHT} />
    ) : splits ? (
      <SplitBars splits={splits} />
    ) : intervals.length > 0 ? (
      <IntervalStrip intervals={intervals} />
    ) : null;
  }

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Svg style={StyleSheet.absoluteFill} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={shown === 'achievement' ? '#3A2A08' : '#14301F'} />
            <Stop offset="0.55" stopColor="#0E1118" />
            <Stop offset="1" stopColor="#0A0A0F" />
          </LinearGradient>
        </Defs>
        <Rect width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} fill="url(#bg)" />
      </Svg>

      <View style={styles.topRow}>
        <Text style={styles.brand} allowFontScaling={false}>SPLITCUE</Text>
        <Text style={styles.eyebrow} allowFontScaling={false} numberOfLines={1}>{eyebrow}</Text>
      </View>

      {shown === 'achievement' && achievement ? (
        <View style={styles.badge}>
          <Ionicons name="trophy" size={13} color={Colors.black} />
          <Text style={styles.badgeText} numberOfLines={1} allowFontScaling={false}>{achievement.kicker}</Text>
        </View>
      ) : badge ? (
        <View style={styles.badge}>
          <Ionicons name="trophy" size={13} color={Colors.black} />
          <Text style={styles.badgeText} numberOfLines={1} allowFontScaling={false}>{badge}</Text>
        </View>
      ) : null}

      <Text
        style={shown === 'achievement' ? styles.nameSmall : styles.name}
        numberOfLines={shown === 'achievement' ? 1 : 2}
        allowFontScaling={false}
      >
        {subject.workoutName}
      </Text>

      {body}

      <View style={styles.visual}>{visual}</View>

      <View style={styles.footer}>
        <View style={styles.footerText}>
          {callToAction ? (
            <Text style={styles.cta} allowFontScaling={false}>{callToAction}</Text>
          ) : null}
          <Text style={styles.byline} numberOfLines={1} allowFontScaling={false}>
            {senderName ? `${senderName} · ` : ''}Run with SplitCue
          </Text>
        </View>
        <Text style={styles.url} allowFontScaling={false}>splitcue.app</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    padding: PAD,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  brand: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
  eyebrow: {
    flexShrink: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.warning,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 16,
    maxWidth: '100%',
  },
  badgeText: {
    color: Colors.black,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 31,
    marginTop: 14,
  },
  nameSmall: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  summary: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  stats: {
    marginTop: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 6,
  },
  statLarge: {},
  stat: {
    minWidth: 72,
  },
  statValueLarge: {
    color: Colors.textPrimary,
    fontSize: 54,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  statValue: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  consistencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  consistencyMeta: {
    flex: 1,
    gap: 4,
  },
  consistencyMetaText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  achievement: {
    marginTop: 16,
  },
  achievementValue: {
    color: Colors.warning,
    fontSize: 84,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  achievementLabel: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginTop: -4,
  },
  achievementMessage: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  achievementTotals: {
    marginTop: 18,
  },
  visual: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: VISUAL_HEIGHT,
  },
  repBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: REP_BARS_HEIGHT,
  },
  repColumn: {
    flex: 1,
    justifyContent: 'flex-end',
    height: REP_BARS_HEIGHT,
  },
  repTarget: {
    position: 'absolute',
    left: -2,
    right: -2,
    height: 2,
    backgroundColor: Colors.white,
    opacity: 0.7,
    zIndex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  footerText: {
    flex: 1,
  },
  cta: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  byline: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  url: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
});
