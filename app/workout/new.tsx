/**
 * Create a new workout.
 *
 * When navigated with ?addToDate=YYYY-MM-DD the newly created workout
 * is also added to the user's training calendar on that date.
 */

import React from 'react';
import { Alert } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { WorkoutDefinition, generateId, flattenWorkout, createSegment, createRepeatGroup } from '../../src/workout/workoutTypes';
import { saveWorkout } from '../../src/workout/workoutStorage';
import { WorkoutEditorForm } from '../../src/components/WorkoutEditorForm';
import { addWorkoutToCalendar } from '../../src/ai/planService';
import { useTrainingPlan } from '../../src/contexts/TrainingPlanContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { track } from '../../src/analytics/track';
import { getRunHistoryContext } from '../../src/analytics/workoutContext';
import { setTempWorkout } from '../../src/workout/tempWorkoutCache';

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewWorkoutScreen() {
  const router = useRouter();
  const { addToDate } = useLocalSearchParams<{ addToDate?: string }>();
  const { ensurePlan } = useTrainingPlan();
  const { user } = useAuth();
  const now = Date.now();

  const blank: WorkoutDefinition = {
    id: generateId(),
    name: '',
    blocks: [
      createSegment('warmup', { target: { type: 'time', durationSeconds: 300 } }),
      createRepeatGroup(4, {
        blocks: [
          createSegment('run', { intensity: 'hard', target: { type: 'time', durationSeconds: 180 } }),
          createSegment('recovery', { target: { type: 'time', durationSeconds: 120 } }),
        ],
      }),
      createSegment('cooldown', { target: { type: 'time', durationSeconds: 300 } }),
    ],
    createdAt: now,
    updatedAt: now,
  };

  return (
    <>
      {addToDate && (
        <Stack.Screen options={{ title: 'New Workout for Plan' }} />
      )}
      <WorkoutEditorForm
        initial={blank}
        onSave={async (workout) => {
          await saveWorkout(workout);
          track('workout_created', {
            workout_id: workout.id,
            workout_name: workout.name,
            interval_count: flattenWorkout(workout).length,
          });

          let planWorkoutId: string | undefined;
          if (addToDate && user) {
            const activePlan = await ensurePlan();
            const added = await addWorkoutToCalendar(
              activePlan.id,
              user.id,
              addToDate,
              workout,
              activePlan.start_date,
            );
            planWorkoutId = added.id;
            track('workout_added_to_plan', {
              workout_id: workout.id,
              date: addToDate,
            });
          }

          // Saving is often where a new runner stops, so offer the run right away.
          const forToday = !addToDate || addToDate === todayDateKey();
          const { is_first_run } = await getRunHistoryContext();
          if (!forToday || !is_first_run) {
            router.back();
            return;
          }
          track('save_start_prompt_shown', { screen: 'new_workout' });
          Alert.alert('Workout Saved', 'Want to head out and run it now?', [
            {
              text: 'Later',
              style: 'cancel',
              onPress: () => {
                track('save_start_prompt_answered', { screen: 'new_workout', start: false });
                router.back();
              },
            },
            {
              text: 'Start Now',
              onPress: () => {
                track('save_start_prompt_answered', { screen: 'new_workout', start: true });
                setTempWorkout(workout, {
                  source: planWorkoutId ? 'calendar' : 'saved_template',
                  templateId: workout.id,
                  planWorkoutId,
                });
                router.replace(`/workout/run/${workout.id}` as any);
              },
            },
          ]);
        }}
        onCancel={() => router.back()}
      />
    </>
  );
}
