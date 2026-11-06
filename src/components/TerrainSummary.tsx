/**
 * Terrain pace summary — three-column layout comparing uphill / flat / downhill.
 *
 * Shows a single card with SVG slope indicators, pace for each terrain type,
 * distance + elevation metadata, and a proportional distance bar.
 * Color scheme matches the ElevationProfile chart.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { TerrainAggregate, TerrainType } from '../pace/elevationAnalysis';
import type { PaceUnit } from '../pace/paceTypes';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { useLargeText } from '../hooks/useLargeText';

interface Props {
  aggregates: TerrainAggregate[];
  paceUnit: PaceUnit;
}

const METERS_PER_MILE = 1_609.344;

const TERRAIN_META: Record<TerrainType, { label: string; color: string }> = {
  uphill: { label: 'Uphill', color: '#F87171' },
  flat: { label: 'Flat', color: '#60A5FA' },
  downhill: { label: 'Downhill', color: '#4ADE80' },
};

const TERRAIN_ORDER: TerrainType[] = ['uphill', 'flat', 'downhill'];

// ── Helpers ──────────────────────────────────────────────────────

function formatPace(paceMinutes: number | null): string {
  if (paceMinutes == null || !isFinite(paceMinutes)) return '--:--';
  const total = Math.round(paceMinutes * 60);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDist(meters: number, unit: PaceUnit): string {
  if (unit === 'minPerMile') {
    return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatElev(meters: number, unit: PaceUnit): string {
  if (unit === 'minPerMile') {
    return `${Math.round(meters * 3.28084)} ft`;
  }
  return `${Math.round(meters)} m`;
}

// ── Slope indicator SVG ─────────────────────────────────────────

function SlopeIndicator({
  type,
  color,
  size = 28,
}: {
  type: TerrainType;
  color: string;
  size?: number;
}) {
  const h = Math.round(size * 0.55);
  const pad = 3;

  let y1: number;
  let y2: number;
  switch (type) {
    case 'uphill':
      y1 = h - pad;
      y2 = pad;
      break;
    case 'downhill':
      y1 = pad;
      y2 = h - pad;
      break;
    default:
      y1 = h / 2;
      y2 = h / 2;
  }

  return (
    <Svg width={size} height={h}>
      <Line
        x1={pad}
        y1={y1}
        x2={size - pad}
        y2={y2}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Main component ──────────────────────────────────────────────

export function TerrainSummary({ aggregates, paceUnit }: Props) {
  const large = useLargeText();

  if (aggregates.length === 0) return null;

  const paceLabel = paceUnit === 'minPerMile' ? '/mi' : '/km';

  const aggMap = new Map<TerrainType, TerrainAggregate>();
  for (const agg of aggregates) aggMap.set(agg.type, agg);

  const totalDist = aggregates.reduce(
    (s, a) => s + a.totalDistanceMeters,
    0,
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Terrain Pace</Text>

      <View style={styles.card}>
        {/* Three-column comparison */}
        <View style={[styles.columns, large && styles.columnsLarge]}>
          {TERRAIN_ORDER.map((type, i) => {
            const agg = aggMap.get(type);
            const meta = TERRAIN_META[type];
            const hasData = agg != null;
            const pace = hasData
              ? paceUnit === 'minPerMile'
                ? agg.avgPaceMinPerMile
                : agg.avgPaceMinPerKm
              : null;

            return (
              <React.Fragment key={type}>
                {i > 0 && <View style={[styles.divider, large && styles.dividerLarge]} />}
                <View
                  style={[
                    styles.column,
                    large && styles.columnLarge,
                    !hasData && styles.columnDimmed,
                  ]}
                >
                  <SlopeIndicator
                    type={type}
                    color={hasData ? meta.color : Colors.textMuted + '55'}
                    size={28}
                  />
                  <Text
                    style={[
                      styles.typeLabel,
                      { color: hasData ? meta.color : Colors.textMuted + '55' },
                    ]}
                  >
                    {meta.label}
                  </Text>
                  <Text
                    style={[
                      styles.paceValue,
                      !hasData && styles.paceValueDimmed,
                    ]}
                    maxFontSizeMultiplier={MaxFontScale.display}
                  >
                    {formatPace(pace)}
                  </Text>
                  <Text
                    style={[
                      styles.paceUnitText,
                      !hasData && styles.paceUnitDimmed,
                    ]}
                  >
                    {paceLabel}
                  </Text>
                  {hasData ? (
                    <View style={styles.meta}>
                      <Text style={styles.metaText}>
                        {formatDist(agg.totalDistanceMeters, paceUnit)}
                      </Text>
                      <Text style={styles.metaText}>
                        {type === 'downhill' ? '↓' : '↑'}{' '}
                        {formatElev(
                          Math.abs(agg.totalElevationChange),
                          paceUnit,
                        )}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.meta}>
                      <Text style={styles.metaPlaceholder}>—</Text>
                    </View>
                  )}
                </View>
              </React.Fragment>
            );
          })}
        </View>

        {/* Proportional distance bar */}
        {totalDist > 0 && (
          <View style={styles.distBarWrap}>
            <View style={styles.distBar}>
              {TERRAIN_ORDER.map((type) => {
                const agg = aggMap.get(type);
                if (!agg || agg.totalDistanceMeters < 1) return null;
                return (
                  <View
                    key={type}
                    style={{
                      flex: agg.totalDistanceMeters / totalDist,
                      backgroundColor: TERRAIN_META[type].color,
                      height: '100%' as const,
                    }}
                  />
                );
              })}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.md,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  columns: {
    flexDirection: 'row',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  columnsLarge: {
    flexDirection: 'column',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  columnLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  columnDimmed: {
    opacity: 0.3,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.surfaceLight,
    marginVertical: Spacing.xs,
  },
  dividerLarge: {
    width: 'auto',
    height: 1,
    marginVertical: 0,
    marginHorizontal: Spacing.md,
  },
  typeLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  paceValue: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  paceValueDimmed: {
    color: Colors.textMuted,
  },
  paceUnitText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: -2,
  },
  paceUnitDimmed: {
    color: Colors.textMuted + '55',
  },
  meta: {
    alignItems: 'center',
    marginTop: 4,
    gap: 1,
  },
  metaText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  metaPlaceholder: {
    fontSize: 11,
    color: Colors.textMuted + '44',
  },
  distBarWrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  distBar: {
    height: 4,
    borderRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceLight,
  },
});
