/**
 * DayDetail — shows detail for a selected calendar date.
 *
 * Renders planned workouts with inline actions (Start, Edit, Skip/Unskip, Remove),
 * completed runs with stats, and empty/rest states.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DayEntry } from '../contexts/TrainingPlanContext';
import type { WorkoutDefinition, WorkoutBlock, Segment, RepeatGroup, CompletedWorkout } from '../workout/workoutTypes';
import { formatTime, totalWorkoutSeconds, totalWorkoutDistanceMeters, isDistanceInterval, defaultSegmentLabel, segmentToIntervalType } from '../workout/workoutTypes';
import { Colors, Spacing, FontSize, BorderRadius, intervalColor } from '../constants/theme';
import type { PaceUnit } from '../pace/paceTypes';
import { useUnits } from '../hooks/useUnits';
import { formatDistance, formatDistanceCompact } from '../units/format';

// ── Types ────────────────────────────────────────────────────

interface DayDetailProps {
  entry: DayEntry | undefined;
  selectedDate: string;
  onStartWorkout: (workoutData: WorkoutDefinition, planWorkoutId: string) => void;
  onRemoveWorkout?: (workoutId: string) => void;
  onMoveWorkout?: (workoutId: string) => void;
  onEditWorkout?: (workoutData: WorkoutDefinition, planWorkoutId: string) => void;
  /** Open voice-driven AI edit for a specific plan workout */
  onVoiceEdit?: (workoutId: string) => void;
  onViewRun: (historyEntryId: string) => void;
  onRunAgain: (run: CompletedWorkout) => void;
  onAddWorkout?: (date: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatDuration(ms: number): string {
  return formatTime(Math.floor(ms / 1000));
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case 'completed': return Colors.primary;
    default: return Colors.accent;
  }
}

// ── Workout Preview (interval summary) ──────────────────────

interface PreviewRow {
  key: string;
  repeatCount: number;
  intervals: { type: string; label: string; durationSeconds: number; distanceMeters?: number }[];
}

function buildPreviewRows(workout: WorkoutDefinition): PreviewRow[] {
  const rows: PreviewRow[] = [];

  function processBlock(block: WorkoutBlock) {
    if (block.blockType === 'segment') {
      const seg = block;
      const dur = seg.target.type === 'time' ? (seg.target.durationSeconds ?? 0) : 0;
      const dist = seg.target.type === 'distance' ? seg.target.distanceMeters : undefined;
      rows.push({
        key: `${rows.length}`,
        repeatCount: 1,
        intervals: [{
          type: segmentToIntervalType(seg.segmentType, seg.intensity),
          label: seg.label || defaultSegmentLabel(seg.segmentType),
          durationSeconds: dur,
          distanceMeters: dist,
        }],
      });
    } else {
      const rg = block;
      const intervals = rg.blocks
        .filter((b): b is Segment => b.blockType === 'segment')
        .map((seg) => ({
          type: segmentToIntervalType(seg.segmentType, seg.intensity),
          label: seg.label || defaultSegmentLabel(seg.segmentType),
          durationSeconds: seg.target.type === 'time' ? (seg.target.durationSeconds ?? 0) : 0,
          distanceMeters: seg.target.type === 'distance' ? seg.target.distanceMeters : undefined,
        }));
      if (intervals.length > 0) {
        rows.push({
          key: `${rows.length}`,
          repeatCount: rg.repetitions,
          intervals,
        });
      }
    }
  }

  for (const block of workout.blocks) {
    processBlock(block);
  }
  return rows;
}

/** Show distance for distance-based intervals, time for time-based. */
function formatIntervalAmount(iv: { durationSeconds: number; distanceMeters?: number }, unit: PaceUnit): string {
  if (isDistanceInterval(iv)) {
    return formatDistanceCompact(iv.distanceMeters!, unit);
  }
  return formatTime(iv.durationSeconds);
}

/** Build the total summary line (handles mixed time + distance workouts). */
function formatWorkoutTotal(workout: WorkoutDefinition, unit: PaceUnit): string {
  const totalSec = totalWorkoutSeconds(workout);
  const totalDist = totalWorkoutDistanceMeters(workout);
  if (totalSec > 0 && totalDist) {
    return `${formatTime(totalSec)} + ${formatDistanceCompact(totalDist, unit)}`;
  }
  if (totalDist) {
    return `${formatDistanceCompact(totalDist, unit)} total`;
  }
  return `${formatTime(totalSec)} total`;
}

function WorkoutPreview({ workoutData, unit }: { workoutData: unknown; unit: PaceUnit }) {
  const workout = workoutData as WorkoutDefinition;
  if (!workout || !workout.blocks) return null;

  const rows = buildPreviewRows(workout);

  return (
    <View style={styles.workoutPreview}>
      <Text style={styles.workoutName}>{workout.name}</Text>
      <Text style={styles.workoutDuration}>
        {formatWorkoutTotal(workout, unit)}
      </Text>
      <View style={styles.intervalList}>
        {rows.slice(0, 6).map((row) => (
          <View key={row.key} style={styles.intervalRow}>
            <View style={[styles.intervalDot, { backgroundColor: intervalColor(row.intervals[0]?.type ?? 'easy') }]} />
            <Text style={styles.intervalLabel} numberOfLines={1}>
              {row.repeatCount > 1 ? `${row.repeatCount}\u00D7 ` : ''}
              {row.intervals.map((iv) => `${iv.label} ${formatIntervalAmount(iv, unit)}`).join(', ')}
            </Text>
          </View>
        ))}
        {rows.length > 6 && (
          <Text style={styles.moreIntervals}>
            +{rows.length - 6} more
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Main Component ──────────────────────────────────────────

export function DayDetail({
  entry,
  selectedDate,
  onStartWorkout,
  onRemoveWorkout,
  onMoveWorkout,
  onEditWorkout,
  onVoiceEdit,
  onViewRun,
  onRunAgain,
  onAddWorkout,
}: DayDetailProps) {
  const dateDisplay = formatDateDisplay(selectedDate);
  const unit = useUnits();

  const handleRemove = (workoutId: string) => {
    Alert.alert(
      'Remove Workout',
      'Remove this workout from your plan?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemoveWorkout?.(workoutId),
        },
      ],
    );
  };

  const runIds = new Set((entry?.completedRuns ?? []).map((run) => run.id));
  // A completed plan workout whose run is listed below would be shown twice
  const planWorkouts = (entry?.planWorkouts ?? []).filter(
    (pw) =>
      pw.day_label !== 'Rest Day' &&
      pw.status !== 'skipped' &&
      !(pw.status === 'completed' && pw.completed_workout_id && runIds.has(pw.completed_workout_id)),
  );

  // Empty day
  if (!entry || (planWorkouts.length === 0 && entry.completedRuns.length === 0)) {
    return (
      <View style={styles.container}>
        <Text style={styles.dateHeader}>{dateDisplay}</Text>
        <View style={styles.emptyDay}>
          <Ionicons name="sunny-outline" size={24} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No activity</Text>
        </View>
        {onAddWorkout && (
          <TouchableOpacity
            style={styles.addWorkoutBtn}
            onPress={() => onAddWorkout(selectedDate)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.addWorkoutBtnText}>Add Workout to This Day</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.dateHeader}>{dateDisplay}</Text>

      {/* Planned workouts — renders all workouts scheduled on this day */}
      {planWorkouts.map((pw) => {
        const isRest = pw.day_label === 'Rest Day';
        const isPlanned = pw.status === 'planned';
        const isCompleted = pw.status === 'completed';
        const hasWorkoutData = !!pw.workout_data;

        return (
          <View key={pw.id} style={styles.planCard}>
            {/* AI edit button — top-right of card (only for detailed workouts in the 14-day window) */}
            {onVoiceEdit && isPlanned && !isRest && hasWorkoutData && (
              <TouchableOpacity
                style={styles.aiEditBtn}
                onPress={() => onVoiceEdit(pw.id)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="mic-outline" size={15} color={Colors.accent} />
                <Text style={styles.aiEditBtnText}>Edit with AI</Text>
              </TouchableOpacity>
            )}

            <View style={styles.planHeader}>
              <View style={[styles.statusBadge, { backgroundColor: statusBadgeColor(pw.status) + '22' }]}>
                <Text style={[styles.statusText, { color: statusBadgeColor(pw.status) }]}>
                  {isCompleted ? 'Completed' : 'Planned'}
                </Text>
              </View>
              <Text style={styles.dayLabel}>{pw.day_label}</Text>
            </View>

            {pw.description && (
              <Text style={styles.description}>{pw.description}</Text>
            )}

            {hasWorkoutData && !isCompleted && (
              <WorkoutPreview workoutData={pw.workout_data} unit={unit} />
            )}

            {/* Rest day */}
            {isRest && (
              <View style={styles.restDay}>
                <Ionicons name="bed-outline" size={20} color={Colors.textMuted} />
                <Text style={styles.restDayText}>Rest and recover</Text>
              </View>
            )}

            {/* ── Actions for planned workouts ── */}
            {isPlanned && !isRest && (
              <>
                {hasWorkoutData && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.startBtn}
                      onPress={() => onStartWorkout(pw.workout_data as WorkoutDefinition, pw.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={16} color={Colors.black} />
                      <Text style={styles.startBtnText}>Start</Text>
                    </TouchableOpacity>

                    {onEditWorkout && (
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => onEditWorkout(pw.workout_data as WorkoutDefinition, pw.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="create-outline" size={14} color={Colors.textPrimary} />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                    )}

                    {onMoveWorkout && (
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => onMoveWorkout(pw.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="swap-horizontal-outline" size={14} color={Colors.textPrimary} />
                        <Text style={styles.editBtnText}>Move</Text>
                      </TouchableOpacity>
                    )}

                    {onRemoveWorkout && (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => handleRemove(pw.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* No workout_data yet — details auto-generated within 14-day window */}
                {!hasWorkoutData && (
                  <View style={styles.outlineOnlyHint}>
                    <Ionicons name="sparkles-outline" size={14} color={Colors.accent} />
                    <Text style={styles.outlineOnlyText}>
                      Your AI coach will add workout details when this day is within the 2-week planning window
                    </Text>
                  </View>
                )}
              </>
            )}

          </View>
        );
      })}

      {/* Add workout button — show when there are no planned workouts for this day */}
      {planWorkouts.length === 0 && onAddWorkout && (
        <TouchableOpacity
          style={styles.addWorkoutBtn}
          onPress={() => onAddWorkout(selectedDate)}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.addWorkoutBtnText}>Add Workout to This Day</Text>
        </TouchableOpacity>
      )}

      {/* Completed runs */}
      {entry.completedRuns.map((run) => (
        <View key={run.id} style={styles.runCard}>
          <View style={styles.runHeader}>
            <View style={[styles.statusBadge, { backgroundColor: Colors.primary + '22' }]}>
              <Ionicons name="checkmark" size={12} color={Colors.primary} />
              <Text style={[styles.statusText, { color: Colors.primary }]}>Completed</Text>
            </View>
            <Text style={styles.runName}>{run.workoutName}</Text>
          </View>

          <View style={styles.runStats}>
            <View style={styles.runStat}>
              <Text style={styles.runStatValue}>{formatDuration(run.totalDurationMs)}</Text>
              <Text style={styles.runStatLabel}>Duration</Text>
            </View>
            {run.totalDistanceMeters != null && run.totalDistanceMeters > 0 && (
              <View style={styles.runStat}>
                <Text style={styles.runStatValue}>{formatDistance(run.totalDistanceMeters, unit)}</Text>
                <Text style={styles.runStatLabel}>Distance</Text>
              </View>
            )}
            {run.splits && (
              <View style={styles.runStat}>
                <Text style={styles.runStatValue}>{run.splits.length}</Text>
                <Text style={styles.runStatLabel}>Splits</Text>
              </View>
            )}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => onViewRun(run.id)}
              activeOpacity={0.7}
            >
              <Ionicons name="eye-outline" size={14} color={Colors.black} />
              <Text style={styles.primaryBtnText}>Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => onRunAgain(run)}
              activeOpacity={0.7}
            >
              <Ionicons name="play" size={14} color={Colors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Run Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  dateHeader: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptyDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },

  // Plan card
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    position: 'relative' as const,
  },
  aiEditBtn: {
    position: 'absolute' as const,
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    zIndex: 1,
  },
  aiEditBtnText: {
    fontSize: FontSize.xs - 1,
    fontWeight: '700',
    color: Colors.accent,
  },
  planHeader: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },

  // Workout preview
  workoutPreview: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  workoutName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  workoutDuration: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  intervalList: {
    gap: 4,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  intervalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  intervalLabel: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  moreIntervals: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  startBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  startBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  editBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineOnlyHint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  outlineOnlyText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Rest day
  restDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  restDayText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Add workout button
  addWorkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
    borderStyle: 'dashed',
  },
  addWorkoutBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Run card
  runCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  runHeader: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  runName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  runStats: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  runStat: {
    gap: 2,
  },
  runStatValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.accent,
    fontVariant: ['tabular-nums'],
  },
  runStatLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  primaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  secondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
