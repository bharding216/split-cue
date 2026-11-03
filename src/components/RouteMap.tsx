/**
 * Interactive route map for completed workouts.
 *
 * Renders the GPS track on a native map with start/finish markers.
 * Supports two overlay modes:
 *   - Pace heatmap: color-coded segments from green (fast) to red (slow)
 *   - Interval markers: shows where each workout interval started
 * The map can be expanded into a full-screen modal.
 */

import React, { useMemo, useRef, useState, type RefObject } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { RoutePoint, IntervalSplit } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import type { PersonalRecord } from '../stats/personalRecords';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

// ── Pace heatmap color ramp (fast → slow) ────────────────────────────

const PACE_COLORS = [
  '#4ADE80', // fastest — green
  '#86EFAC', // fast — light green
  '#FBBF24', // moderate — yellow
  '#FB923C', // slow — orange
  '#F87171', // slowest — red
] as const;

const PACE_BUCKET_COUNT = PACE_COLORS.length;

// ── Types ────────────────────────────────────────────────────────────

interface Coord {
  latitude: number;
  longitude: number;
}

interface PaceSegment {
  coordinates: Coord[];
  color: string;
}

interface IntervalMarker {
  coordinate: Coord;
  label: string;
  color: string;
}

type MapOverlay = 'route' | 'pace' | 'records';

// ── Helpers ──────────────────────────────────────────────────────────

function toCoord(pt: RoutePoint): Coord {
  return { latitude: pt.lat, longitude: pt.lng };
}

/**
 * Compute per-segment pace (min/unit) from consecutive RoutePoints.
 * Returns null for segments with insufficient distance or time.
 */
function segmentPace(
  a: RoutePoint,
  b: RoutePoint,
  metersPerUnit: number,
): number | null {
  const dist = b.dist - a.dist;
  const timeMs = b.ts - a.ts;
  if (dist < 0.5 || timeMs < 100) return null;
  const mps = dist / (timeMs / 1000);
  // Guard unrealistic: < 0.3 m/s (standing) or > 12 m/s (~2:15 min/mi)
  if (mps < 0.3 || mps > 12) return null;
  return metersPerUnit / mps / 60;
}

/**
 * Build color-coded polyline segments from route data.
 * Groups consecutive points with the same pace bucket into one segment.
 */
function buildPaceSegments(
  route: RoutePoint[],
  paceUnit: PaceUnit,
): PaceSegment[] {
  if (route.length < 2) return [];

  const metersPerUnit = paceUnit === 'minPerMile' ? 1609.344 : 1000;

  // Compute raw pace for each segment
  const paces: (number | null)[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    paces.push(segmentPace(route[i], route[i + 1], metersPerUnit));
  }

  // Collect valid paces for percentile calculation
  const validPaces = paces.filter((p): p is number => p !== null);
  if (validPaces.length < 3) return [];

  validPaces.sort((a, b) => a - b);
  const p10 = validPaces[Math.floor(validPaces.length * 0.1)];
  const p90 = validPaces[Math.floor(validPaces.length * 0.9)];
  const range = p90 - p10 || 1;

  // Assign each segment a color bucket
  function bucketIndex(pace: number | null): number {
    if (pace === null) return Math.floor(PACE_BUCKET_COUNT / 2); // neutral
    // Lower pace = faster = lower bucket index (greener)
    const normalized = Math.max(0, Math.min(1, (pace - p10) / range));
    return Math.min(PACE_BUCKET_COUNT - 1, Math.floor(normalized * PACE_BUCKET_COUNT));
  }

  // Group consecutive segments with the same bucket
  const segments: PaceSegment[] = [];
  let currentBucket = bucketIndex(paces[0]);
  let currentCoords: Coord[] = [toCoord(route[0]), toCoord(route[1])];

  for (let i = 1; i < paces.length; i++) {
    const bucket = bucketIndex(paces[i]);
    if (bucket === currentBucket) {
      currentCoords.push(toCoord(route[i + 1]));
    } else {
      segments.push({
        coordinates: currentCoords,
        color: PACE_COLORS[currentBucket],
      });
      // Start new segment, overlapping the last point for continuity
      currentBucket = bucket;
      currentCoords = [toCoord(route[i]), toCoord(route[i + 1])];
    }
  }
  segments.push({
    coordinates: currentCoords,
    color: PACE_COLORS[currentBucket],
  });

  return segments;
}

/**
 * Compute map markers at the start of each workout interval
 * by correlating split durations with route point timestamps.
 */
function buildIntervalMarkers(
  route: RoutePoint[],
  splits: IntervalSplit[],
): IntervalMarker[] {
  if (route.length < 2 || !splits.length) return [];

  const INTERVAL_COLORS: Record<string, string> = {
    hard: Colors.hard,
    easy: Colors.easy,
    warmup: Colors.warmup,
    cooldown: Colors.cooldown,
  };

  const startTs = route[0].ts;
  const markers: IntervalMarker[] = [];
  let cumulativeMs = 0;

  for (let i = 0; i < splits.length; i++) {
    const boundaryTs = startTs + cumulativeMs;

    // Find the route point closest to this timestamp
    let closest = route[0];
    let minDiff = Math.abs(route[0].ts - boundaryTs);
    for (const pt of route) {
      const diff = Math.abs(pt.ts - boundaryTs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pt;
      }
    }

    // Skip the very first marker (it overlaps with start pin)
    if (i > 0) {
      markers.push({
        coordinate: toCoord(closest),
        label: splits[i].label,
        color: INTERVAL_COLORS[splits[i].type] || Colors.textSecondary,
      });
    }

    cumulativeMs += splits[i].actualDurationMs;
  }

  return markers;
}

// ── Component ────────────────────────────────────────────────────────

/** Marker to show on the map where a PB distance was hit. */
interface PbDistanceMarker {
  coordinate: Coord;
  label: string; // e.g. "Fastest Mile"
  displayValue: string; // e.g. "7:23"
}

/** Build PB distance markers from route data and personal records. */
function buildPbMarkers(
  route: RoutePoint[],
  records: PersonalRecord[],
): PbDistanceMarker[] {
  const DISTANCE_CATEGORIES: Record<string, number> = {
    fastest_mile: 1609.344,
    fastest_5k: 5000,
    fastest_10k: 10000,
    fastest_half_marathon: 21097,
  };

  const markers: PbDistanceMarker[] = [];
  for (const record of records) {
    const targetMeters = DISTANCE_CATEGORIES[record.category];
    if (!targetMeters) continue;
    if (route[route.length - 1].dist < targetMeters) continue;

    // Find the route point where this distance was reached
    for (let i = 1; i < route.length; i++) {
      if (route[i].dist >= targetMeters) {
        markers.push({
          coordinate: toCoord(route[i]),
          label: record.label,
          displayValue: record.displayValue,
        });
        break;
      }
    }
  }
  return markers;
}

interface RouteMapProps {
  route: RoutePoint[];
  splits?: IntervalSplit[];
  paceUnit?: PaceUnit;
  height?: number;
  width?: number;
  /** Personal records to show as markers on the route. */
  records?: PersonalRecord[];
}

export function RouteMap({
  route,
  splits,
  paceUnit = 'minPerMile',
  height = 250,
  records,
}: RouteMapProps) {
  const mapRef = useRef<MapView>(null);
  const fullscreenMapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const [overlay, setOverlay] = useState<MapOverlay>('route');
  const [fullscreen, setFullscreen] = useState(false);

  const coordinates = useMemo(
    () => route.map(toCoord),
    [route],
  );

  const paceSegments = useMemo(
    () => (overlay === 'pace' ? buildPaceSegments(route, paceUnit) : []),
    [route, paceUnit, overlay],
  );

  const intervalMarkers = useMemo(
    () => (splits && splits.length > 0 ? buildIntervalMarkers(route, splits) : []),
    [route, splits],
  );

  const pbMarkers = useMemo(
    () => (records && records.length > 0 ? buildPbMarkers(route, records) : []),
    [route, records],
  );

  const hasRecords = pbMarkers.length > 0;

  const hasPaceData = useMemo(() => {
    if (route.length < 10) return false;
    // Need enough route points with meaningful distance
    return route[route.length - 1].dist > 50;
  }, [route]);

  const fitMap = (
    ref: RefObject<MapView | null>,
    animated: boolean,
    edgePadding = { top: 48, right: 32, bottom: 48, left: 32 },
  ) => {
    if (coordinates.length > 1 && ref.current) {
      ref.current.fitToCoordinates(coordinates, { edgePadding, animated });
    }
  };

  // Leave room for the floating top bar and bottom legend panel
  const fullscreenPadding = {
    top: insets.top + 96,
    right: 32,
    bottom: insets.bottom + 120,
    left: 32,
  };
  const fitFullscreenMap = (animated: boolean) =>
    fitMap(fullscreenMapRef, animated, fullscreenPadding);

  if (route.length < 2) return null;

  const startCoord = toCoord(route[0]);
  const endCoord = toCoord(route[route.length - 1]);

  // Overlay toggle: route vs pace heatmap
  const overlayToggle = hasPaceData ? (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[
          styles.toggleBtn,
          overlay === 'route' && styles.toggleBtnActive,
        ]}
        onPress={() => setOverlay('route')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="navigate-outline"
          size={12}
          color={overlay === 'route' ? Colors.primary : Colors.textMuted}
        />
        <Text
          style={[
            styles.toggleLabel,
            overlay === 'route' && styles.toggleLabelActive,
          ]}
        >
          Route
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.toggleBtn,
          overlay === 'pace' && styles.toggleBtnActive,
        ]}
        onPress={() => setOverlay('pace')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="speedometer-outline"
          size={12}
          color={overlay === 'pace' ? Colors.primary : Colors.textMuted}
        />
        <Text
          style={[
            styles.toggleLabel,
            overlay === 'pace' && styles.toggleLabelActive,
          ]}
        >
          Pace
        </Text>
      </TouchableOpacity>

      {hasRecords && (
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            overlay === 'records' && styles.toggleBtnActive,
          ]}
          onPress={() => setOverlay('records')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="trophy-outline"
            size={12}
            color={overlay === 'records' ? Colors.warning : Colors.textMuted}
          />
          <Text
            style={[
              styles.toggleLabel,
              overlay === 'records' && styles.toggleLabelActive,
              overlay === 'records' && { color: Colors.warning },
            ]}
          >
            PBs
          </Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  const mapLayers = (
    <>
      {/* Route line — single color or pace heatmap */}
      {overlay === 'pace' && paceSegments.length > 0 ? (
        paceSegments.map((seg, i) => (
          <Polyline
            key={`pace-${i}`}
            coordinates={seg.coordinates}
            strokeColor={seg.color}
            strokeWidth={4}
          />
        ))
      ) : (
        <Polyline
          coordinates={coordinates}
          strokeColor={Colors.accent}
          strokeWidth={4}
        />
      )}

      {/* Interval boundary markers */}
      {intervalMarkers.map((m, i) => (
        <Marker
          key={`interval-${i}`}
          coordinate={m.coordinate}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={[styles.intervalDot, { backgroundColor: m.color }]}>
            <Text style={styles.intervalDotText}>
              {i + 1}
            </Text>
          </View>
        </Marker>
      ))}

      {/* PB distance markers */}
      {overlay === 'records' && pbMarkers.map((m, i) => (
        <Marker
          key={`pb-${i}`}
          coordinate={m.coordinate}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
        >
          <View style={styles.pbPinContainer}>
            <View style={styles.pbPin}>
              <Ionicons name="trophy" size={10} color={Colors.black} />
            </View>
            <View style={styles.pbPinTail} />
          </View>
        </Marker>
      ))}

      {/* Start marker */}
      <Marker
        coordinate={startCoord}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={false}
      >
        <View style={styles.pinContainer}>
          <View style={[styles.pin, { backgroundColor: Colors.primary }]}>
            <Ionicons name="flag" size={12} color={Colors.black} />
          </View>
          <View style={[styles.pinTail, { borderTopColor: Colors.primary }]} />
        </View>
      </Marker>

      {/* Finish marker */}
      <Marker
        coordinate={endCoord}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={false}
      >
        <View style={styles.pinContainer}>
          <View style={[styles.pin, { backgroundColor: Colors.danger }]}>
            <Ionicons name="flag" size={12} color={Colors.white} />
          </View>
          <View style={[styles.pinTail, { borderTopColor: Colors.danger }]} />
        </View>
      </Marker>
    </>
  );

  const showPaceLegend = overlay === 'pace' && paceSegments.length > 0;
  const showPbLegend = overlay === 'records' && pbMarkers.length > 0;
  const showIntervalLegend = intervalMarkers.length > 0;
  const hasLegend = showPaceLegend || showPbLegend || showIntervalLegend;

  const legends = (
    <>
      {/* Pace heatmap legend */}
      {showPaceLegend && (
        <View style={styles.legend}>
          <Text style={styles.legendLabel}>Fast</Text>
          <View style={styles.legendRamp}>
            {PACE_COLORS.map((c, i) => (
              <View
                key={i}
                style={[styles.legendSwatch, { backgroundColor: c }]}
              />
            ))}
          </View>
          <Text style={styles.legendLabel}>Slow</Text>
        </View>
      )}

      {/* PB records legend */}
      {showPbLegend && (
        <View style={styles.pbLegend}>
          {pbMarkers.map((m, i) => (
            <View key={`pb-legend-${i}`} style={styles.pbLegendItem}>
              <View style={styles.pbLegendDot}>
                <Ionicons name="trophy" size={8} color={Colors.black} />
              </View>
              <Text style={styles.pbLegendLabel} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={styles.pbLegendValue}>
                {m.displayValue}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Interval legend (when markers are visible) */}
      {showIntervalLegend && (
        <View style={styles.intervalLegend}>
          {intervalMarkers.map((m, i) => (
            <View key={i} style={styles.intervalLegendItem}>
              <View style={[styles.intervalLegendDot, { backgroundColor: m.color }]}>
                <Text style={styles.intervalLegendDotText}>{i + 1}</Text>
              </View>
              <Text style={styles.intervalLegendLabel} numberOfLines={1}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  );

  const sharedMapProps = {
    userInterfaceStyle: 'dark',
    pitchEnabled: false,
    rotateEnabled: false,
    showsUserLocation: false,
    showsMyLocationButton: false,
    showsCompass: false,
    showsTraffic: false,
    showsBuildings: false,
    showsIndoors: false,
    showsPointsOfInterest: false,
    toolbarEnabled: false,
    loadingEnabled: true,
    loadingBackgroundColor: Colors.surface,
  } as const;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Route</Text>
        {overlayToggle}
      </View>

      <View style={[styles.mapWrapper, { height }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          // Android's fitToCoordinates throws if the native map hasn't been sized yet,
          // which can still be the case in onLayout / onMapReady.
          onMapLoaded={() => fitMap(mapRef, false)}
          showsScale={false}
          {...sharedMapProps}
        >
          {mapLayers}
        </MapView>

        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => setFullscreen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View route full screen"
          hitSlop={8}
        >
          <Ionicons name="expand-outline" size={16} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {legends}

      <Modal
        visible={fullscreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fullscreenContainer}>
          <MapView
            ref={fullscreenMapRef}
            style={StyleSheet.absoluteFill}
            onMapLoaded={() => fitFullscreenMap(false)}
            showsScale
            {...sharedMapProps}
          >
            {mapLayers}
          </MapView>

          <View style={[styles.fullscreenTopBar, { top: insets.top + Spacing.sm }]}>
            <TouchableOpacity
              style={styles.fullscreenIconBtn}
              onPress={() => setFullscreen(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close full screen route"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>

            {overlayToggle}

            <TouchableOpacity
              style={styles.fullscreenIconBtn}
              onPress={() => fitFullscreenMap(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Recenter route"
              hitSlop={8}
            >
              <Ionicons name="locate-outline" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {hasLegend && (
            <View
              style={[
                styles.fullscreenLegendPanel,
                { bottom: insets.bottom + Spacing.md },
              ]}
            >
              {legends}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm - 2,
  },
  toggleBtnActive: {
    backgroundColor: Colors.surfaceLight,
  },
  toggleLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  toggleLabelActive: {
    color: Colors.primary,
  },
  mapWrapper: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  map: {
    flex: 1,
  },
  expandBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 15, 0.75)',
  },
  // Full-screen modal
  fullscreenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullscreenTopBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fullscreenIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
  },
  fullscreenLegendPanel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    paddingHorizontal: Spacing.md,
    // Legend rows already carry their own marginTop
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm + Spacing.xs,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(22, 22, 31, 0.92)',
  },
  // Custom pin markers
  pinContainer: {
    alignItems: 'center',
  },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
  // Interval dot markers on the map
  intervalDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  intervalDotText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.white,
  },
  // Pace legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  legendLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  legendRamp: {
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
  },
  legendSwatch: {
    width: 24,
    height: 8,
  },
  // PB pin markers
  pbPinContainer: {
    alignItems: 'center',
  },
  pbPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  pbPinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.warning,
    marginTop: -2,
  },
  // PB legend
  pbLegend: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  pbLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pbLegendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pbLegendLabel: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  pbLegendValue: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.warning,
    fontVariant: ['tabular-nums'],
  },
  // Interval legend
  intervalLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  intervalLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  intervalLegendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  intervalLegendDotText: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.white,
  },
  intervalLegendLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    maxWidth: 80,
  },
});
