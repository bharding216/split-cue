/**
 * Workout editor — edit an existing workout.
 * Shared component with the "new" screen via WorkoutEditorForm.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Modal, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useShareSheet } from '../../src/components/ShareSheet';
import { WorkoutDefinition, generateId, withResolvedCategory } from '../../src/workout/workoutTypes';
import { loadWorkouts, saveWorkout } from '../../src/workout/workoutStorage';
import { withEditedAttribution } from '../../src/sharing/shareWorkout';
import { getTempWorkout, getTempWorkoutMeta, clearTempWorkout } from '../../src/workout/tempWorkoutCache';
import { WorkoutEditorForm } from '../../src/components/WorkoutEditorForm';
import { VoiceEditSheet } from '../../src/components/VoiceEditSheet';
import { applyPlanModifications, addWorkoutToCalendar, type PlanModification } from '../../src/ai/planService';
import { useTrainingPlan } from '../../src/contexts/TrainingPlanContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { track } from '../../src/analytics/track';

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { plans, planWorkouts, refresh, ensurePlan, updateWorkoutData } = useTrainingPlan();
  const [workout, setWorkout] = useState<WorkoutDefinition | null>(null);
  const [fromPlan, setFromPlan] = useState(false);
  const [planWorkoutId, setPlanWorkoutId] = useState<string | undefined>();
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(tomorrowDateKey());
  const [addingToCalendar, setAddingToCalendar] = useState(false);
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

  const handleAddToCalendar = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Sign in to add workouts to your training calendar.');
      return;
    }
    const current = latest.current ?? workout;
    if (!current) return;
    setAddingToCalendar(true);
    try {
      const activePlan = await ensurePlan();
      await addWorkoutToCalendar(activePlan.id, user.id, calendarDate, current, activePlan.start_date);
      track('workout_added_to_plan', {
        workout_id: current.id,
        workout_name: current.name,
        date: calendarDate,
        source: 'editor',
      });
      await refresh();
      setCalendarPickerOpen(false);
      Alert.alert(
        'Added to Calendar',
        `"${current.name}" was added to ${formatDateDisplay(calendarDate)}.`,
        [{ text: 'OK' }],
      );
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not add workout to calendar.');
    } finally {
      setAddingToCalendar(false);
    }
  };

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
                    setCalendarDate(tomorrowDateKey());
                    setCalendarPickerOpen(true);
                  }}
                  hitSlop={8}
                  style={styles.shareButton}
                  accessibilityRole="button"
                  accessibilityLabel="Add to training calendar"
                >
                  <Ionicons name="calendar-outline" size={22} color={Colors.textPrimary} />
                </TouchableOpacity>
              )}
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
          const attributed = withEditedAttribution(workout, updated);
          latest.current = attributed;
          await saveWorkout({ ...attributed, updatedAt: Date.now() });
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
            ...withResolvedCategory(withEditedAttribution(workout, updated)),
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

      {/* Add to Calendar date picker modal */}
      <Modal
        visible={calendarPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCalendarPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setCalendarPickerOpen(false)}
            activeOpacity={1}
            accessibilityLabel="Close"
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Calendar</Text>
              <TouchableOpacity
                onPress={() => setCalendarPickerOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Choose a date to add "{workout.name}" to your training calendar.
            </Text>

            <View style={styles.datePickerWrapper}>
              <DateTimePicker
                value={new Date(calendarDate + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                minimumDate={new Date(todayDateKey() + 'T00:00:00')}
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  if (Platform.OS === 'android' && _event.type === 'dismissed') {
                    return;
                  }
                  if (selected) {
                    const y = selected.getFullYear();
                    const m = String(selected.getMonth() + 1).padStart(2, '0');
                    const d = String(selected.getDate()).padStart(2, '0');
                    setCalendarDate(`${y}-${m}-${d}`);
                  }
                }}
                themeVariant="dark"
              />
            </View>

            <TouchableOpacity
              style={styles.addToCalendarBtn}
              onPress={handleAddToCalendar}
              activeOpacity={0.8}
              disabled={addingToCalendar}
            >
              {addingToCalendar ? (
                <ActivityIndicator color={Colors.black} size="small" />
              ) : (
                <>
                  <Ionicons name="calendar" size={18} color={Colors.black} />
                  <Text style={styles.addToCalendarBtnText}>
                    Add to {formatDateDisplay(calendarDate)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Add to Calendar modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  datePickerWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addToCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  addToCalendarBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
});
