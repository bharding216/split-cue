/**
 * Workout editor — edit an existing workout.
 * Shared component with the "new" screen via WorkoutEditorForm.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useShareSheet } from '../../src/components/ShareSheet';
import { WorkoutDefinition, generateId, withResolvedCategory } from '../../src/workout/workoutTypes';
import { loadWorkouts, saveWorkout } from '../../src/workout/workoutStorage';
import { getTempWorkout, getTempWorkoutMeta, clearTempWorkout } from '../../src/workout/tempWorkoutCache';
import { WorkoutEditorForm } from '../../src/components/WorkoutEditorForm';
import { VoiceEditSheet } from '../../src/components/VoiceEditSheet';
import { applyPlanModifications, type PlanModification } from '../../src/ai/planService';
import { useTrainingPlan } from '../../src/contexts/TrainingPlanContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { track } from '../../src/analytics/track';

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { plans, planWorkouts, refresh, updateWorkoutData } = useTrainingPlan();
  const [workout, setWorkout] = useState<WorkoutDefinition | null>(null);
  const [fromPlan, setFromPlan] = useState(false);
  const [planWorkoutId, setPlanWorkoutId] = useState<string | undefined>();
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const planWorkout = planWorkoutId ? planWorkouts.find((w) => w.id === planWorkoutId) : undefined;
  const ownerPlan = planWorkout ? plans.find((p) => p.id === planWorkout.plan_id) : undefined;
  const canAiEdit = !!user && !!planWorkout && !!ownerPlan && planWorkout.status === 'planned';
  /** The latest autosaved version, so sharing picks up edits. */
  const latest = useRef<WorkoutDefinition | null>(null);
  const { openShare, shareSheet } = useShareSheet();

  useEffect(() => {
    const cached = getTempWorkout(id!);
    if (cached) {
      setPlanWorkoutId(getTempWorkoutMeta(id!)?.planWorkoutId);
      clearTempWorkout(id!);
      setWorkout(cached);
      setFromPlan(true);
    } else {
      loadWorkouts().then((all) => {
        const found = all.find((w) => w.id === id);
        if (found) setWorkout(found);
      });
    }
  }, [id]);

  if (!workout) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              {!fromPlan && (
                <TouchableOpacity
                  onPress={() => {
                    const current = latest.current ?? workout;
                    openShare({ kind: 'structure', workout: current, workoutName: current.name, surface: 'editor' });
                  }}
                  hitSlop={8}
                  style={styles.shareButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${workout.name}`}
                >
                  <Ionicons name="share-outline" size={22} color={Colors.textPrimary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.back()}
                activeOpacity={0.8}
                style={styles.doneButton}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <WorkoutEditorForm
        initial={workout}
        autoSave={!fromPlan}
        isPlanWorkout={fromPlan}
        onAiEdit={canAiEdit ? () => setAiEditOpen(true) : undefined}
        onSave={async (updated) => {
          if (planWorkoutId) {
            try {
              await updateWorkoutData(planWorkoutId, updated);
            } catch (e) {
              Alert.alert('Save Failed', e instanceof Error ? e.message : 'Could not update this workout.');
              return;
            }
            router.back();
            return;
          }
          latest.current = updated;
          await saveWorkout({ ...updated, updatedAt: Date.now() });
          track('workout_saved', {
            workout_id: updated.id,
            workout_name: updated.name,
            is_copy: false,
          });
          if (fromPlan) router.back();
        }}
        onSaveAsNew={async (updated) => {
          const now = Date.now();
          const newId = generateId();
          const name = planWorkoutId
            ? updated.name
            : updated.name.replace(/\s*\(copy\)$/i, '') + ' (Copy)';
          await saveWorkout({
            ...withResolvedCategory(updated),
            id: newId,
            name,
            createdAt: now,
            updatedAt: now,
          });
          track('workout_saved', {
            workout_id: newId,
            workout_name: updated.name,
            is_copy: true,
          });
          if (planWorkoutId) {
            Alert.alert('Saved to My Workouts', `"${name}" was added to My Workouts.`);
            return;
          }
          router.back();
        }}
        onCancel={() => router.back()}
      />
      {/* Mounted only while open so the native recorder isn't created with the editor */}
      {aiEditOpen && planWorkout && ownerPlan && (
        <VoiceEditSheet
          visible
          workout={planWorkout}
          plan={ownerPlan}
          planWorkouts={planWorkouts.filter((w) => w.plan_id === ownerPlan.id)}
          onApply={async (modifications: PlanModification[]) => {
            await applyPlanModifications(ownerPlan.id, modifications);
            setAiEditOpen(false);
            await refresh();
            router.back();
          }}
          onClose={() => setAiEditOpen(false)}
        />
      )}
      {shareSheet}
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  shareButton: {
    padding: Spacing.xs,
  },
  doneButton: {
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
  },
  doneButtonText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
