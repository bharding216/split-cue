/**
 * WorkoutPickerModal — bottom sheet to pick a workout for a specific calendar date.
 *
 * Two sources: built-in workout templates (filterable by category) and, optionally,
 * the user's recently completed workouts. Also offers voice and manual creation.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  WorkoutDefinition,
  WorkoutCategory,
  totalWorkoutSeconds,
  formatTime,
  flattenWorkout,
  categorizeWorkout,
  generateId,
} from '../workout/workoutTypes';
import { createPresets } from '../workout/presets';
import { loadHistory } from '../workout/workoutStorage';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { useLargeText } from '../hooks/useLargeText';

const MAX_RECENT = 8;

type PickerTab = 'templates' | 'recent';

interface RecentWorkout {
  workout: WorkoutDefinition;
  completedAt: number;
}

interface WorkoutPickerModalProps {
  visible: boolean;
  date: string;
  onSelect: (workout: WorkoutDefinition) => void;
  onCreateNew: () => void;
  onVoiceBuilder?: () => void;
  onDateChange?: (newDate: string) => void;
  onClose: () => void;
}

// ── Category helpers ─────────────────────────────────────────

const CATEGORIES: { key: WorkoutCategory; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }[] = [
  { key: 'easy', label: 'Easy', icon: 'leaf-outline', color: Colors.easy },
  { key: 'tempo', label: 'Tempo', icon: 'speedometer-outline', color: Colors.warning },
  { key: 'intervals', label: 'Intervals', icon: 'repeat', color: Colors.danger },
  { key: 'long_run', label: 'Long Run', icon: 'trail-sign-outline', color: Colors.accent },
  { key: 'race', label: 'Race', icon: 'trophy-outline', color: Colors.primary },
];

function categoryColor(cat: string): string {
  return CATEGORIES.find((c) => c.key === cat)?.color ?? Colors.textSecondary;
}

function categoryIcon(cat: string): React.ComponentProps<typeof Ionicons>['name'] {
  return CATEGORIES.find((c) => c.key === cat)?.icon ?? 'barbell-outline';
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatCompletedDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Most recent completed workouts with a replayable configuration, one per workout name. */
async function loadRecentWorkouts(): Promise<RecentWorkout[]> {
  const history = await loadHistory();
  const seen = new Set<string>();
  const recent: RecentWorkout[] = [];
  for (const entry of history) {
    if (!entry.configuration || entry.configuration.blocks.length === 0) continue;
    const key = entry.workoutName.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push({
      workout: { ...entry.configuration, id: generateId(), name: entry.workoutName },
      completedAt: entry.completedAt,
    });
    if (recent.length >= MAX_RECENT) break;
  }
  return recent;
}

// ── Component ────────────────────────────────────────────────

export function WorkoutPickerModal({
  visible,
  date,
  onSelect,
  onCreateNew,
  onVoiceBuilder,
  onDateChange,
  onClose,
}: WorkoutPickerModalProps) {
  const templates = useMemo(() => createPresets(), []);
  const [recent, setRecent] = useState<RecentWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PickerTab>('templates');
  const [activeCategory, setActiveCategory] = useState<WorkoutCategory | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const large = useLargeText();

  const dateObj = useMemo(() => new Date(date + 'T12:00:00'), [date]);

  const handleDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected && onDateChange) {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const d = String(selected.getDate()).padStart(2, '0');
      onDateChange(`${y}-${m}-${d}`);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setTab('templates');
    setActiveCategory(null);
    setShowDatePicker(false);
    loadRecentWorkouts()
      .then(setRecent)
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const filteredTemplates = useMemo(
    () => (activeCategory ? templates.filter((w) => categorizeWorkout(w) === activeCategory) : templates),
    [templates, activeCategory],
  );

  const listData: { workout: WorkoutDefinition; completedAt?: number }[] =
    tab === 'recent' ? recent : filteredTemplates.map((workout) => ({ workout }));

  const handleCategoryToggle = (cat: WorkoutCategory) => {
    setActiveCategory((prev) => (prev === cat ? null : cat));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} accessibilityLabel="Close" />
        <View style={[styles.sheet, large && styles.sheetLarge]}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} maxFontSizeMultiplier={MaxFontScale.display}>Add Workout</Text>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => setShowDatePicker((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityHint="Changes the date"
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.headerDateTappable}>{formatDateDisplay(date)}</Text>
                <Ionicons name="chevron-down" size={12} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <View style={styles.datePickerContainer}>
              <DateTimePicker
                value={dateObj}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                onChange={handleDateChange}
                themeVariant="dark"
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.datePickerDone}
                  onPress={() => setShowDatePicker(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {large && showDatePicker && Platform.OS === 'ios' ? null : loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : (
            <>
              {/* Templates / Recent toggle — only when there is history to show */}
              {recent.length > 0 && (
                <View style={styles.tabRow}>
                  {([
                    { key: 'templates', label: 'Templates' },
                    { key: 'recent', label: 'Recent' },
                  ] as const).map((t) => {
                    const isActive = tab === t.key;
                    return (
                      <TouchableOpacity
                        key={t.key}
                        style={[styles.tab, isActive && styles.tabActive]}
                        onPress={() => setTab(t.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Category filter chips */}
              {tab === 'templates' && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipScroll}
                  contentContainerStyle={styles.chipRow}
                >
                  {CATEGORIES.map((cat) => {
                    const isActive = activeCategory === cat.key;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        style={[
                          styles.chip,
                          isActive && { backgroundColor: cat.color + '22', borderColor: cat.color },
                        ]}
                        onPress={() => handleCategoryToggle(cat.key)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={cat.icon}
                          size={13}
                          color={isActive ? cat.color : Colors.textMuted}
                        />
                        <Text style={[styles.chipLabel, isActive && { color: cat.color }]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Workout list */}
              <FlatList
                style={styles.list}
                data={listData}
                keyExtractor={(item) => item.workout.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  tab === 'templates' && !activeCategory ? (
                    <>
                      {/* Voice workout builder */}
                      {onVoiceBuilder && (
                        <TouchableOpacity
                          style={styles.voiceBuilderRow}
                          onPress={onVoiceBuilder}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.workoutIcon, { backgroundColor: Colors.accent + '22' }]}>
                            <Ionicons name="mic" size={20} color={Colors.accent} />
                          </View>
                          <View style={styles.workoutInfo}>
                            <Text style={styles.workoutName}>Describe with Voice</Text>
                            <Text style={styles.workoutMeta}>Tell the AI coach what you want</Text>
                          </View>
                          <View style={styles.aiBadge}>
                            <Ionicons name="sparkles" size={12} color={Colors.accent} />
                            <Text style={styles.aiBadgeText}>AI</Text>
                          </View>
                        </TouchableOpacity>
                      )}

                      {/* Create new manually */}
                      <TouchableOpacity
                        style={styles.createNewRow}
                        onPress={onCreateNew}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.workoutIcon, { backgroundColor: Colors.primary + '22' }]}>
                          <Ionicons name="add" size={20} color={Colors.primary} />
                        </View>
                        <View style={styles.workoutInfo}>
                          <Text style={styles.workoutName}>Create New Workout</Text>
                          <Text style={styles.workoutMeta}>Build a custom workout from scratch</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={32} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>No templates in this category</Text>
                  </View>
                }
                renderItem={({ item: { workout, completedAt } }) => {
                  const cat = categorizeWorkout(workout);
                  const flat = flattenWorkout(workout);
                  const totalSec = totalWorkoutSeconds(workout);

                  return (
                    <TouchableOpacity
                      style={styles.workoutRow}
                      onPress={() => onSelect(workout)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.workoutIcon, { backgroundColor: categoryColor(cat) + '22' }]}>
                        <Ionicons name={categoryIcon(cat)} size={18} color={categoryColor(cat)} />
                      </View>
                      <View style={styles.workoutInfo}>
                        <Text style={styles.workoutName} numberOfLines={large ? 3 : 1}>{workout.name}</Text>
                        <Text style={styles.workoutMeta}>
                          {formatTime(totalSec)} · {flat.length} interval{flat.length !== 1 ? 's' : ''}
                          {completedAt !== undefined ? ` · Ran ${formatCompletedDate(completedAt)}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={Colors.primary} />
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    height: '80%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  sheetLarge: {
    height: '94%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  headerDateTappable: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  datePickerContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  datePickerDoneText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  loadingContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },

  // Templates / Recent toggle
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: 3,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.surfaceLight,
  },
  tabLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.textPrimary,
  },

  // Category chips
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
  },
  chipLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  voiceBuilderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.accent + '44',
    borderStyle: 'dashed',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.accent + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  aiBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  createNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
    borderStyle: 'dashed',
  },
  workoutIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  workoutMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
