/**
 * MoveWorkoutModal — a simple modal that lets the user pick a new date
 * for a planned workout. Shows a compact calendar grid so they can see
 * which days already have workouts scheduled.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import type { DayEntry } from '../contexts/TrainingPlanContext';
import { useLargeText } from '../hooks/useLargeText';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const SCREEN_WIDTH = Dimensions.get('window').width;

/** Text inside the 7-column grid can't widen its cell, so it scales less than body text. */
const CELL_FONT_SCALE = 1.3;

interface MoveWorkoutModalProps {
  visible: boolean;
  currentDate: string;
  workoutLabel: string;
  dayEntries: Record<string, DayEntry>;
  onMove: (newDate: string) => void;
  onClose: () => void;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return toDateKey(new Date());
}

function getMonthDays(year: number, month: number): string[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: string[][] = [];
  let week: string[] = new Array(firstDay).fill('');

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    week.push(key);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push('');
    weeks.push(week);
  }
  return weeks;
}

export function MoveWorkoutModal({
  visible,
  currentDate,
  workoutLabel,
  dayEntries,
  onMove,
  onClose,
}: MoveWorkoutModalProps) {
  const initDate = new Date(currentDate + 'T12:00:00');
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const large = useLargeText();

  const today = todayKey();

  const weeks = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthLabel = useMemo(() => {
    const d = new Date(viewYear, viewMonth);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth]);

  const goToPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selected && selected !== currentDate) {
      onMove(selected);
    }
  }, [selected, currentDate, onMove]);

  const handleOpen = useCallback(() => {
    const d = new Date(currentDate + 'T12:00:00');
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelected(null);
  }, [currentDate]);

  const canConfirm = selected && selected !== currentDate;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title} maxFontSizeMultiplier={MaxFontScale.display}>Move Workout</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle} numberOfLines={large ? 3 : 1}>{workoutLabel}</Text>

            {/* Month nav */}
            <View style={styles.monthNav}>
              <TouchableOpacity
                onPress={goToPrevMonth}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.monthLabel} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MaxFontScale.display}>
                {monthLabel}
              </Text>
              <TouchableOpacity
                onPress={goToNextMonth}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View style={styles.weekdayRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.weekdayLabel} numberOfLines={1} maxFontSizeMultiplier={CELL_FONT_SCALE}>
                  {label}
                </Text>
              ))}
            </View>

            {/* Calendar grid */}
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((dateKey, di) => {
                  if (!dateKey) {
                    return <View key={di} style={styles.dayCell} />;
                  }

                  const dayNum = parseInt(dateKey.split('-')[2], 10);
                  const isToday = dateKey === today;
                  const isCurrent = dateKey === currentDate;
                  const isSelected = dateKey === selected;
                  const entry = dayEntries[dateKey];
                  const hasPlannedWorkout = (entry?.planWorkouts ?? []).some(
                    (pw) => pw.day_label !== 'Rest Day',
                  ) && dateKey !== currentDate;
                  const hasCompletedRun = (entry?.completedRuns?.length ?? 0) > 0;

                  return (
                    <TouchableOpacity
                      key={di}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        isCurrent && !isSelected && styles.dayCellCurrent,
                      ]}
                      onPress={() => setSelected(dateKey)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={[
                        new Date(dateKey + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
                        isToday && 'Today',
                        isCurrent && 'Current date',
                        hasPlannedWorkout && 'Has workout',
                        hasCompletedRun && 'Completed',
                      ].filter(Boolean).join(', ')}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isToday && styles.dayTextToday,
                          isCurrent && styles.dayTextCurrent,
                          isSelected && styles.dayTextSelected,
                        ]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={CELL_FONT_SCALE}
                      >
                        {dayNum}
                      </Text>
                      {/* Dot indicators */}
                      <View style={styles.dotRow}>
                        {isCurrent && (
                          <View style={[styles.dot, { backgroundColor: Colors.warning }]} />
                        )}
                        {hasPlannedWorkout && (
                          <View style={[styles.dot, { backgroundColor: Colors.accent }]} />
                        )}
                        {hasCompletedRun && (
                          <View style={[styles.dot, { backgroundColor: Colors.primary }]} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
                <Text style={styles.legendText}>Current</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
                <Text style={styles.legendText}>Has workout</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                <Text style={styles.legendText}>Completed</Text>
              </View>
            </View>

            {/* Confirm button */}
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal" size={16} color={canConfirm ? Colors.black : Colors.textMuted} />
              <Text style={[styles.confirmBtnText, !canConfirm && styles.confirmBtnTextDisabled]}>
                {selected
                  ? `Move to ${new Date(selected + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
                  : 'Select a date'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const CELL_SIZE = Math.floor((SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md * 2) / 7);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  sheetContent: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  title: {
    flexShrink: 1,
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  monthLabel: {
    flexShrink: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.xs,
  },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayCell: {
    width: CELL_SIZE,
    minHeight: CELL_SIZE,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
  },
  dayCellCurrent: {
    backgroundColor: Colors.warning + '20',
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },
  dayText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  dayTextToday: {
    fontWeight: '800',
    color: Colors.primary,
  },
  dayTextCurrent: {
    color: Colors.warning,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: Colors.black,
    fontWeight: '800',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    height: 6,
    marginTop: 1,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
  confirmBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.black,
  },
  confirmBtnTextDisabled: {
    color: Colors.textMuted,
  },
});
