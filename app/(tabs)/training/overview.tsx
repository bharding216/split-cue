/**
 * Plan Overview screen — "Where is this training taking me?"
 *
 * Shows race-goal header, training phases, weekly breakdown,
 * and an "Adjust My Plan" button.
 */

import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTrainingPlan } from '../../../src/contexts/TrainingPlanContext';
import { TrainingPhases } from '../../../src/components/TrainingPhases';
import { ContextualProPrompt } from '../../../src/components/ContextualProPrompt';
import { VoicePlanAdjustSheet } from '../../../src/components/VoicePlanAdjustSheet';
import { useStartPlanCreation } from '../../../src/hooks/useStartPlanCreation';
import { DELETED_PLAN_RETENTION_DAYS } from '../../../src/ai/planService';
import { useLargeText, useScaledSize } from '../../../src/hooks/useLargeText';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../../src/constants/theme';

function formatRaceLabel(raceType: string): string {
  switch (raceType) {
    case '5k': return '5K';
    case '10k': return '10K';
    case 'half_marathon': return 'Half Marathon';
    case 'marathon': return 'Marathon';
    default: return 'Training';
  }
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function daysUntilPurge(deletedAt: string | null): number {
  if (!deletedAt) return DELETED_PLAN_RETENTION_DAYS;
  const purgeAt = new Date(deletedAt).getTime() + DELETED_PLAN_RETENTION_DAYS * 86400000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / 86400000));
}

export default function PlanOverviewScreen() {
  const router = useRouter();
  const startPlanCreation = useStartPlanCreation();
  const {
    plans,
    archivedPlans,
    deletedPlans,
    planWorkouts,
    archivePlan,
    restorePlan,
    deletePlan,
    restoreDeletedPlan,
    updatePlan,
    refresh,
  } = useTrainingPlan();
  const [archiving, setArchiving] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [showDaysPicker, setShowDaysPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [phasesExpanded, setPhasesExpanded] = useState(false);
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [showAdjustSheet, setShowAdjustSheet] = useState(false);
  const large = useLargeText();
  const dayOptionSize = useScaledSize(52, MaxFontScale.display);

  const primaryPlan = useMemo(
    () => plans.find((p) => p.race_type !== 'custom' || (p.outline && p.outline.length > 0)) ?? null,
    [plans],
  );

  const currentWeekNumber = useMemo(() => {
    if (!primaryPlan) return 0;
    const today = new Date();
    const start = new Date(primaryPlan.start_date);
    return Math.max(1, Math.ceil((today.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  }, [primaryPlan]);

  const totalWeeks = useMemo(() => {
    if (!primaryPlan) return 0;
    const start = new Date(primaryPlan.start_date);
    const end = new Date(primaryPlan.race_date);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  }, [primaryPlan]);

  const handleArchivePlan = useCallback((planId: string, planTitle: string) => {
    Alert.alert(
      'Archive Plan',
      `Are you sure you want to archive "${planTitle}"? This will remove it from your active plans. You won't lose any completed workout history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setArchiving(planId);
            try {
              await archivePlan(planId);
            } finally {
              setArchiving(null);
            }
          },
        },
      ],
    );
  }, [archivePlan]);

  const handleRestorePlan = useCallback(async (planId: string) => {
    setRestoring(planId);
    try {
      await restorePlan(planId);
    } finally {
      setRestoring(null);
    }
  }, [restorePlan]);

  const handleDeletePlan = useCallback((planId: string, planTitle: string) => {
    Alert.alert(
      'Delete Plan',
      `Delete "${planTitle}"? It will move to Recently Deleted and be permanently removed after ${DELETED_PLAN_RETENTION_DAYS} days. Your completed runs stay in your history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(planId);
            try {
              await deletePlan(planId);
            } catch (err) {
              console.warn('Failed to delete plan:', err);
              Alert.alert('Error', 'Failed to delete plan. Please try again.');
            } finally {
              setDeleting(null);
            }
          },
        },
      ],
    );
  }, [deletePlan]);

  const handleRecoverPlan = useCallback(async (planId: string) => {
    setRecovering(planId);
    try {
      await restoreDeletedPlan(planId);
    } catch (err) {
      console.warn('Failed to recover plan:', err);
      Alert.alert('Error', 'Failed to recover plan. Please try again.');
    } finally {
      setRecovering(null);
    }
  }, [restoreDeletedPlan]);

  const handleEditTitle = useCallback(() => {
    if (!primaryPlan) return;
    setEditingTitle(primaryPlan.title || formatRaceLabel(primaryPlan.race_type));
    setShowTitleEditor(true);
  }, [primaryPlan]);

  const handleSaveTitle = useCallback(async () => {
    if (!primaryPlan) return;
    const trimmed = editingTitle.trim();
    setShowTitleEditor(false);
    if (!trimmed || trimmed === primaryPlan.title) return;
    try {
      await updatePlan(primaryPlan.id, { title: trimmed });
    } catch (err) {
      console.warn('Failed to update title:', err);
      Alert.alert('Error', 'Failed to update plan title. Please try again.');
    }
  }, [primaryPlan, editingTitle, updatePlan]);

  const handleUpdateDaysPerWeek = useCallback(async (days: number) => {
    if (!primaryPlan) return;
    setShowDaysPicker(false);
    try {
      await updatePlan(primaryPlan.id, { days_per_week: days });
    } catch (err) {
      console.warn('Failed to update days per week:', err);
      Alert.alert('Error', 'Failed to update runs per week. Please try again.');
    }
  }, [primaryPlan, updatePlan]);

  const handleUpdateRaceDate = useCallback(async (_event: any, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (!primaryPlan || !date) return;
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (dateStr === primaryPlan.race_date) return;
    try {
      await updatePlan(primaryPlan.id, { race_date: dateStr });
    } catch (err) {
      console.warn('Failed to update race date:', err);
      Alert.alert('Error', 'Failed to update race date. Please try again.');
    }
  }, [primaryPlan, updatePlan]);

  // All real training plans (for the manage section) — includes custom-distance plans with outlines
  const allRacePlans = useMemo(
    () => plans.filter((p) => p.race_type !== 'custom' || (p.outline && p.outline.length > 0)),
    [plans],
  );

  const archivedRacePlans = useMemo(
    () => archivedPlans.filter((p) => p.race_type !== 'custom' || (p.outline && p.outline.length > 0)),
    [archivedPlans],
  );

  const deletedRacePlans = useMemo(
    () => deletedPlans.filter((p) => p.race_type !== 'custom' || (p.outline && p.outline.length > 0)),
    [deletedPlans],
  );

  const archivedRows = archivedRacePlans.map((p) => (
    <View key={p.id} style={[styles.planRow, styles.planRowArchived]}>
      <View style={styles.planRowInfo}>
        <Text style={[styles.planRowName, styles.archivedName]} numberOfLines={large ? undefined : 1}>
          {p.title || formatRaceLabel(p.race_type)}
        </Text>
        <Text style={styles.planRowMeta}>
          {formatRaceLabel(p.race_type)} · Archived
        </Text>
      </View>
      <TouchableOpacity
        style={styles.restoreBtn}
        onPress={() => handleRestorePlan(p.id)}
        disabled={restoring === p.id || deleting === p.id}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Restore plan"
        hitSlop={4}
      >
        <Ionicons name="arrow-undo-outline" size={16} color={Colors.accent} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDeletePlan(p.id, p.title || formatRaceLabel(p.race_type))}
        disabled={restoring === p.id || deleting === p.id}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Delete plan"
        hitSlop={4}
      >
        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
      </TouchableOpacity>
    </View>
  ));

  const deletedRows = deletedRacePlans.map((p) => {
    const daysLeft = daysUntilPurge(p.deleted_at);
    return (
      <View key={p.id} style={[styles.planRow, styles.planRowArchived]}>
        <View style={styles.planRowInfo}>
          <Text style={[styles.planRowName, styles.archivedName]} numberOfLines={large ? undefined : 1}>
            {p.title || formatRaceLabel(p.race_type)}
          </Text>
          <Text style={styles.planRowMeta}>
            {daysLeft > 1 ? `Permanently deleted in ${daysLeft} days` : 'Permanently deleted within a day'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={() => handleRecoverPlan(p.id)}
          disabled={recovering === p.id}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Recover plan"
          hitSlop={4}
        >
          <Ionicons name="arrow-undo-outline" size={16} color={Colors.accent} />
        </TouchableOpacity>
      </View>
    );
  });

  if (!primaryPlan) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.centeredScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.centeredInner}>
          <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Active Plan</Text>
          <Text style={styles.emptyText}>Create a training plan to get started.</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={startPlanCreation}
            activeOpacity={0.8}
          >
            <Text style={styles.createBtnText} maxFontSizeMultiplier={MaxFontScale.display}>Create Plan</Text>
          </TouchableOpacity>
        </View>

        {/* Show archived plans so user can restore */}
        {archivedRacePlans.length > 0 && (
          <View style={styles.managePlansSection}>
            <Text style={styles.managePlansTitle}>Archived Plans</Text>
            {archivedRows}
          </View>
        )}
        {deletedRacePlans.length > 0 && (
          <View style={styles.managePlansSection}>
            <Text style={styles.managePlansTitle}>Recently Deleted</Text>
            {deletedRows}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Plan header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.titleRow}
          onPress={handleEditTitle}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityHint="Edit plan name"
        >
          <Text
            style={styles.planTitle}
            numberOfLines={large ? undefined : 1}
            maxFontSizeMultiplier={MaxFontScale.display}
          >
            {primaryPlan.title || formatRaceLabel(primaryPlan.race_type)}
          </Text>
          <Ionicons name="pencil" size={16} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.planSubtitle}>
          {totalWeeks}-week training program
        </Text>
      </View>

      {/* Stats row */}
      <View style={[styles.statsRow, large && styles.statsRowLarge]}>
        <View style={[styles.stat, large && styles.statLarge]}>
          <Text style={styles.statValue}>{currentWeekNumber} / {totalWeeks}</Text>
          <Text style={styles.statLabel}>Current week</Text>
        </View>
        <View style={[styles.statDivider, large && styles.statDividerLarge]} />
        <TouchableOpacity
          style={[styles.stat, large && styles.statLarge]}
          onPress={() => setShowDaysPicker(true)}
          activeOpacity={0.6}
          accessibilityRole="button"
        >
          <View style={styles.editableValue}>
            <Text style={styles.statValue}>{primaryPlan.days_per_week}</Text>
            <Ionicons name="pencil" size={14} color={Colors.primary} />
          </View>
          <Text style={styles.statLabel}>Runs / week</Text>
        </TouchableOpacity>
        <View style={[styles.statDivider, large && styles.statDividerLarge]} />
        <TouchableOpacity
          style={[styles.stat, large && styles.statLarge]}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.6}
          accessibilityRole="button"
        >
          <View style={styles.editableValue}>
            <Text style={styles.statValue}>
              {new Date(primaryPlan.race_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
            <Ionicons name="pencil" size={14} color={Colors.primary} />
          </View>
          <Text style={styles.statLabel}>{(primaryPlan.goal_type ?? 'race') === 'pace_target' ? 'Target date' : 'Race day'}</Text>
        </TouchableOpacity>
      </View>

      {/* Days-per-week picker modal */}
      <Modal
        visible={showDaysPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDaysPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDaysPicker(false)}
        >
          <View style={[styles.modalContent, large && styles.modalContentLarge]}>
            <Text style={styles.modalTitle}>Runs per week</Text>
            <View style={styles.daysGrid}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.dayOption,
                    { width: dayOptionSize, height: dayOptionSize },
                    n === primaryPlan.days_per_week && styles.dayOptionActive,
                  ]}
                  onPress={() => handleUpdateDaysPerWeek(n)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} ${n === 1 ? 'run' : 'runs'} per week`}
                  accessibilityState={{ selected: n === primaryPlan.days_per_week }}
                >
                  <Text
                    style={[
                      styles.dayOptionText,
                      n === primaryPlan.days_per_week && styles.dayOptionTextActive,
                    ]}
                    maxFontSizeMultiplier={MaxFontScale.display}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Race date picker */}
      {Platform.OS === 'ios' && showDatePicker && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          >
            <View style={styles.dateModalContent}>
              <Text style={styles.modalTitle}>{(primaryPlan.goal_type ?? 'race') === 'pace_target' ? 'Target date' : 'Race date'}</Text>
              <View style={styles.datePickerWrapper}>
                <DateTimePicker
                  value={new Date(primaryPlan.race_date + 'T00:00:00')}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(event, date) => {
                    handleUpdateRaceDate(event, date);
                  }}
                  themeVariant="dark"
                  style={{ height: 180, width: '100%' }}
                />
              </View>
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setShowDatePicker(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={new Date(primaryPlan.race_date + 'T00:00:00')}
          mode="date"
          minimumDate={new Date()}
          onChange={handleUpdateRaceDate}
          themeVariant="dark"
        />
      )}

      {/* Title editor modal */}
      <Modal
        visible={showTitleEditor}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTitleEditor(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTitleEditor(false)}
        >
          <View style={[styles.modalContent, large && styles.modalContentLarge]} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Plan name</Text>
            <TextInput
              style={styles.titleInput}
              value={editingTitle}
              onChangeText={setEditingTitle}
              placeholder="Enter plan name"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveTitle}
            />
            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={handleSaveTitle}
              activeOpacity={0.7}
            >
              <Text style={styles.modalDoneBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Training phases */}
      <TrainingPhases
        outline={primaryPlan.outline}
        phases={primaryPlan.phases}
        approach={primaryPlan.approach}
        currentWeekNumber={currentWeekNumber}
        maxVisible={2}
        expanded={phasesExpanded}
        onToggleExpanded={() => setPhasesExpanded((v) => !v)}
      />

      {/* Race prediction teaser */}
      <ContextualProPrompt
        momentId="race_prediction_teaser"
        onUpgrade={() => router.push('/paywall' as any)}
      />

      {/* Adjust plan button — voice-first sheet */}
      <TouchableOpacity
        style={styles.adjustBtn}
        onPress={() => setShowAdjustSheet(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="mic" size={18} color={Colors.black} />
        <Text style={styles.adjustBtnText} maxFontSizeMultiplier={MaxFontScale.display}>Adjust My Plan</Text>
      </TouchableOpacity>

      <VoicePlanAdjustSheet
        visible={showAdjustSheet}
        plan={primaryPlan}
        planWorkouts={planWorkouts}
        onClose={() => setShowAdjustSheet(false)}
        onApplied={() => {
          refresh();
          setShowAdjustSheet(false);
          router.back();
        }}
      />

      {/* Manage Plans section */}
      {(allRacePlans.length > 0 || archivedRacePlans.length > 0 || deletedRacePlans.length > 0) && (
        <View style={styles.managePlansSection}>
          <Text style={styles.managePlansTitle}>Manage Plans</Text>
          {allRacePlans.map((p) => {
            const isPrimary = p.id === primaryPlan?.id;
            const planDaysToRace = daysUntil(p.race_date);
            const planWorkoutCount = planWorkouts.filter((w) => w.plan_id === p.id).length;
            return (
              <View key={p.id} style={styles.planRow}>
                <View style={styles.planRowInfo}>
                  <View style={[styles.planRowHeader, large && styles.planRowHeaderLarge]}>
                    <Text
                      style={[styles.planRowName, large && styles.planRowNameLarge]}
                      numberOfLines={large ? undefined : 1}
                    >
                      {p.title || formatRaceLabel(p.race_type)}
                    </Text>
                    {isPrimary && allRacePlans.length > 1 && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.planRowMeta}>
                    {formatRaceLabel(p.race_type)} · {planWorkoutCount} workouts · {planDaysToRace > 0 ? `${planDaysToRace} days left` : (p.goal_type ?? 'race') === 'pace_target' ? 'Complete' : 'Race passed'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.archiveBtn}
                  onPress={() => handleArchivePlan(p.id, p.title || formatRaceLabel(p.race_type))}
                  disabled={archiving === p.id}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Archive plan"
                  hitSlop={4}
                >
                  <Ionicons name="archive-outline" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Archived plans */}
          {archivedRacePlans.length > 0 && (
            <>
              <Text style={styles.archivedLabel}>Archived</Text>
              {archivedRows}
            </>
          )}

          {deletedRacePlans.length > 0 && (
            <>
              <Text style={styles.archivedLabel}>Recently Deleted</Text>
              {deletedRows}
            </>
          )}
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
  centeredScroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
  },
  centeredInner: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl * 2,
    marginTop: Spacing.md,
  },
  createBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // Header
  header: {
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  planTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  planSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  statsRowLarge: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statLarge: {
    flex: 0,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  editableValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.surfaceLight,
  },
  statDividerLarge: {
    width: '100%',
    height: 1,
    marginVertical: Spacing.sm,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: '80%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  modalContentLarge: {
    width: '92%',
    maxWidth: 480,
  },
  dateModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: '90%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  datePickerWrapper: {
    overflow: 'hidden',
    alignItems: 'center',
    marginHorizontal: -Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  dayOption: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOptionActive: {
    backgroundColor: Colors.primary,
  },
  dayOptionText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  dayOptionTextActive: {
    color: Colors.black,
  },
  titleInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  modalDoneBtn: {
    marginTop: Spacing.lg,
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  modalDoneBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.black,
  },

  // Adjust button
  adjustBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  adjustBtnText: {
    flexShrink: 1,
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },

  // Manage plans
  managePlansSection: {
    marginTop: Spacing.xl,
  },
  managePlansTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  planRowInfo: {
    flex: 1,
  },
  planRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  planRowHeaderLarge: {
    flexWrap: 'wrap',
    rowGap: Spacing.xs,
  },
  planRowName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  planRowNameLarge: {
    flex: 0,
    flexShrink: 1,
  },
  primaryBadge: {
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  primaryBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  planRowMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  archiveBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    marginLeft: Spacing.sm,
  },
  archivedLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  planRowArchived: {
    opacity: 0.6,
  },
  archivedName: {
    color: Colors.textSecondary,
  },
  restoreBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent + '15',
    marginLeft: Spacing.sm,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger + '15',
    marginLeft: Spacing.sm,
  },
});
