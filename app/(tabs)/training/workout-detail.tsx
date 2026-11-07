/**
 * Workout Detail screen — view and manage a planned workout.
 *
 * Clean layout: header, workout structure, and action buttons.
 * Accessed via query params: ?workoutId=<plan_workout_id>
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTrainingPlan } from '../../../src/contexts/TrainingPlanContext';
import { WorkoutStructure } from '../../../src/components/WorkoutStructure';
import { MoveWorkoutModal } from '../../../src/components/MoveWorkoutModal';
import { WorkoutDefinition, generateId, totalWorkoutSeconds, flattenWorkout } from '../../../src/workout/workoutTypes';
import { setTempWorkout } from '../../../src/workout/tempWorkoutCache';
import { planWorkoutSource } from '../../../src/analytics/workoutContext';
import { generateWorkoutDetails, loadCoachContext } from '../../../src/ai/planService';
import { useAuth } from '../../../src/contexts/AuthContext';
import { prepareWorkoutAudio } from '../../../src/audio/prepareVoice';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../../src/constants/theme';
import { useLargeText } from '../../../src/hooks/useLargeText';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function getIntensityTag(label: string | null): { text: string; color: string } | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  if (lower.includes('easy') || lower.includes('recovery')) return { text: 'Easy', color: Colors.easy };
  if (lower.includes('tempo') || lower.includes('threshold')) return { text: 'Moderate', color: Colors.warning };
  if (lower.includes('interval') || lower.includes('speed') || lower.includes('hard')) return { text: 'Speed', color: Colors.hard };
  if (lower.includes('long')) return { text: 'Long Run', color: Colors.accent };
  return null;
}

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const { plans, planWorkouts, history, dayEntries, refresh, removeWorkout, moveWorkout } = useTrainingPlan();
  const { user } = useAuth();
  const large = useLargeText();
  const [generatingDetail, setGeneratingDetail] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);

  const planWorkout = useMemo(
    () => planWorkouts.find((pw) => pw.id === workoutId) ?? null,
    [planWorkouts, workoutId],
  );

  const ownerPlan = useMemo(
    () => (planWorkout ? plans.find((p) => p.id === planWorkout.plan_id) : null) ?? null,
    [plans, planWorkout],
  );

  const workoutData = planWorkout?.workout_data as WorkoutDefinition | null;
  const intensity = getIntensityTag(planWorkout?.day_label ?? null);

  useEffect(() => {
    if (workoutData?.blocks?.length) prepareWorkoutAudio(workoutData);
  }, [workoutData]);

  const duration = useMemo(() => {
    if (!workoutData) return null;
    const secs = totalWorkoutSeconds(workoutData);
    return secs > 0 ? Math.round(secs / 60) : null;
  }, [workoutData]);

  const intervalCount = useMemo(() => {
    if (!workoutData) return 0;
    return flattenWorkout(workoutData).length;
  }, [workoutData]);

  const dayName = planWorkout
    ? DAY_NAMES[new Date(planWorkout.date + 'T12:00:00').getDay()]
    : '';

  const dateDisplay = planWorkout ? formatDateDisplay(planWorkout.date) : '';

  const isRest = planWorkout?.day_label === 'Rest Day';
  const isCompleted = planWorkout?.status === 'completed';

  const handleStart = useCallback(() => {
    if (!workoutData || !planWorkout) return;
    const workout: WorkoutDefinition = {
      ...workoutData,
      id: workoutData.id || generateId(),
      updatedAt: Date.now(),
    };
    setTempWorkout(workout, { source: planWorkoutSource(ownerPlan), planWorkoutId: planWorkout.id });
    router.push(`/workout/run/${workout.id}`);
  }, [workoutData, planWorkout, ownerPlan, router]);

  const handleEdit = useCallback(() => {
    if (!workoutData || !planWorkout) return;
    const workout: WorkoutDefinition = {
      ...workoutData,
      id: workoutData.id || generateId(),
      updatedAt: Date.now(),
    };
    setTempWorkout(workout, { planWorkoutId: planWorkout.id });
    router.push(`/workout/${workout.id}`);
  }, [workoutData, planWorkout, router]);

  const handleGenerateDetail = useCallback(async () => {
    if (!planWorkout || !ownerPlan) return;
    setGeneratingDetail(true);
    try {
      const context = user
        ? await loadCoachContext(user.id, history).catch(() => undefined)
        : undefined;
      await generateWorkoutDetails(ownerPlan, [planWorkout], context);
      await refresh();
    } catch (err) {
      console.warn('Failed to generate workout detail:', err);
    } finally {
      setGeneratingDetail(false);
    }
  }, [planWorkout, ownerPlan, user, history, refresh]);

  const handleMove = useCallback(async (newDate: string) => {
    if (!planWorkout) return;
    setShowMoveModal(false);
    await moveWorkout(planWorkout.id, newDate);
  }, [planWorkout, moveWorkout]);

  const handleRemove = useCallback(() => {
    if (!planWorkout) return;
    Alert.alert(
      'Remove Workout',
      'Remove this workout from your plan?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeWorkout(planWorkout.id);
            router.back();
          },
        },
      ],
    );
  }, [planWorkout, removeWorkout, router]);

  if (!planWorkout) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Workout not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Date & status row */}
      <View style={styles.dateRow}>
        <Text style={styles.dateText}>{dayName}, {dateDisplay}</Text>
        {isCompleted && (
          <View style={[styles.statusPill, { backgroundColor: Colors.primary + '22' }]}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
            <Text style={[styles.statusText, { color: Colors.primary }]}>Completed</Text>
          </View>
        )}
      </View>

      {/* Workout name */}
      <Text style={styles.workoutName} maxFontSizeMultiplier={MaxFontScale.display}>
        {planWorkout.day_label || 'Training'}
      </Text>

      {/* Quick stats */}
      {workoutData && (
        <View style={styles.statsRow}>
          {duration && (
            <View style={styles.statChip}>
              <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.statText}>{duration} min</Text>
            </View>
          )}
          {intervalCount > 0 && (
            <View style={styles.statChip}>
              <Ionicons name="layers-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.statText}>{intervalCount} intervals</Text>
            </View>
          )}
          {intensity && (
            <View style={[styles.statChip, { borderColor: intensity.color + '30' }]}>
              <Ionicons name="flame-outline" size={14} color={intensity.color} />
              <Text style={[styles.statText, { color: intensity.color }]}>{intensity.text}</Text>
            </View>
          )}
        </View>
      )}

      {/* Week context */}
      <View style={styles.weekRow}>
        <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.weekText}>Week {planWorkout.week_number}</Text>
        {ownerPlan && (
          <>
            <Text style={styles.weekDot}>·</Text>
            <Text style={[styles.weekText, styles.weekPlanTitle]}>{ownerPlan.title || 'Training Plan'}</Text>
          </>
        )}
      </View>

      {/* Description */}
      {planWorkout.description && (
        <Text style={styles.description}>{planWorkout.description}</Text>
      )}

      {/* Rest day card */}
      {isRest && (
        <View style={styles.restCard}>
          <Ionicons name="bed-outline" size={28} color={Colors.textMuted} />
          <Text style={styles.restTitle}>Rest Day</Text>
          <Text style={styles.restText}>Take it easy — recovery is part of the plan.</Text>
        </View>
      )}

      {/* Workout structure */}
      {workoutData && !isRest && (
        <View style={styles.structureSection}>
          <WorkoutStructure workout={workoutData} />
        </View>
      )}

      {/* No workout data yet */}
      {!workoutData && !isRest && planWorkout.status === 'planned' && (
        <View style={styles.generateCard}>
          <Ionicons name="sparkles-outline" size={24} color={Colors.accent} />
          <Text style={styles.generateTitle}>Workout details not generated yet</Text>
          <Text style={styles.generateDesc}>
            Generate the full interval structure for this workout.
          </Text>
          <TouchableOpacity
            style={styles.generateBtn}
            onPress={handleGenerateDetail}
            disabled={generatingDetail}
            activeOpacity={0.8}
          >
            {generatingDetail ? (
              <ActivityIndicator size="small" color={Colors.black} />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color={Colors.black} />
                <Text style={styles.generateBtnText}>Generate Details</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Move workout modal */}
      {planWorkout && (
        <MoveWorkoutModal
          visible={showMoveModal}
          currentDate={planWorkout.date}
          workoutLabel={planWorkout.day_label || 'Training'}
          dayEntries={dayEntries}
          onMove={handleMove}
          onClose={() => setShowMoveModal(false)}
        />
      )}

      {/* Action buttons */}
      {planWorkout.status === 'planned' && !isRest && (
        <View style={styles.actions}>
          {workoutData && (
            <>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={handleStart}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={18} color={Colors.black} />
                <Text style={styles.startBtnText}>Start Workout</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.editBtn}
                onPress={handleEdit}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={16} color={Colors.textPrimary} />
                <Text style={styles.editBtnText}>Edit Workout</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={[styles.secondaryRow, large && styles.secondaryRowStacked]}>
            <TouchableOpacity
              style={[styles.secondaryBtn, large && styles.secondaryBtnStacked]}
              onPress={() => setShowMoveModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.secondaryBtnText}>Move</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, large && styles.secondaryBtnStacked]}
              onPress={handleRemove}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={14} color={Colors.danger} />
              <Text style={[styles.secondaryBtnText, { color: Colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
    paddingBottom: Spacing.xxl * 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Date row
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  dateText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Name
  workoutName: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  statText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Week context
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  weekText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  weekDot: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  weekPlanTitle: {
    flexShrink: 1,
  },

  // Description
  description: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },

  // Rest day
  restCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  restTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  restText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Structure section
  structureSection: {
    marginBottom: Spacing.sm,
  },

  // Generate card
  generateCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.accent + '20',
  },
  generateTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  generateDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xs,
  },
  generateBtnText: {
    color: Colors.black,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // Actions
  actions: {
    gap: Spacing.sm,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  startBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  editBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    gap: Spacing.xs,
  },
  secondaryRowStacked: {
    flexDirection: 'column',
  },
  secondaryBtnStacked: {
    flex: 0,
  },
  secondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
