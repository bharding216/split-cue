/**
 * Workout editor — edit an existing workout.
 * Shared component with the "new" screen via WorkoutEditorForm.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WorkoutDefinition, generateId, withResolvedCategory } from '../../src/workout/workoutTypes';
import { loadWorkouts, saveWorkout } from '../../src/workout/workoutStorage';
import { getTempWorkout, getTempWorkoutMeta, clearTempWorkout } from '../../src/workout/tempWorkoutCache';
import { WorkoutEditorForm } from '../../src/components/WorkoutEditorForm';
import { useTrainingPlan } from '../../src/contexts/TrainingPlanContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { track } from '../../src/analytics/track';

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { updateWorkoutData } = useTrainingPlan();
  const [workout, setWorkout] = useState<WorkoutDefinition | null>(null);
  const [fromPlan, setFromPlan] = useState(false);
  const [planWorkoutId, setPlanWorkoutId] = useState<string | undefined>();

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
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.8}
              style={styles.doneButton}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <WorkoutEditorForm
        initial={workout}
        autoSave={!fromPlan}
        isPlanWorkout={fromPlan}
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
