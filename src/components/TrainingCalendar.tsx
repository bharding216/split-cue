/**
 * TrainingCalendar — month/week calendar view adapted from setpoint-ai.
 * Shows colored dots for completed runs and planned workouts.
 * Custom-built with RN core views (no third-party calendar library).
 * Supports swipe-to-navigate in both month and week views.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { DayEntry } from '../contexts/TrainingPlanContext';

// ── Types ────────────────────────────────────────────────────

export type CalendarViewMode = 'month' | 'week';

/** Number of days ahead the AI coach auto-generates workout details. */
const AI_WINDOW_DAYS = 14;

interface TrainingCalendarProps {
  dayEntries: Record<string, DayEntry>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  viewMode: CalendarViewMode;
  onChangeViewMode: (mode: CalendarViewMode) => void;
  /** ISO date strings (YYYY-MM-DD) of races — shown with flag markers */
  raceDates?: string[];
  /** ISO date strings (YYYY-MM-DD) of pace-goal target dates — shown with speedometer markers */
  goalDates?: string[];
  /** When true, shows the 14-day AI coach planning window overlay */
  showAIWindow?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const SCREEN_WIDTH = Dimensions.get('window').width;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return toDateKey(new Date());
}

function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const start = new Date(year, month, 1 - startOffset);
  const weeks: Date[][] = [];

  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(start));
      start.setDate(start.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(start));
    start.setDate(start.getDate() + 1);
  }
  return days;
}

function dotColor(entry: DayEntry): string[] {
  const dots: string[] = [];

  // Plan workout dots — skip rest days so they appear blank on the calendar
  for (const pw of entry.planWorkouts) {
    const isRest = pw.day_label === 'Rest Day';
    if (!isRest) {
      switch (pw.status) {
        case 'completed':
          dots.push(Colors.primary);
          break;
        case 'planned':
          dots.push(Colors.accent);
          break;
      }
    }
  }

  // Completed runs (non-plan)
  const linkedIds = new Set(entry.planWorkouts.map((pw) => pw.completed_workout_id).filter(Boolean));
  for (const run of entry.completedRuns) {
    if (!linkedIds.has(run.id)) {
      dots.push(Colors.primary);
    }
  }

  return dots.slice(0, 3);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Component ────────────────────────────────────────────────

export function TrainingCalendar({
  dayEntries,
  selectedDate,
  onSelectDate,
  viewMode,
  onChangeViewMode,
  raceDates,
  goalDates,
  showAIWindow,
}: TrainingCalendarProps) {
  const raceDateSet = useMemo(() => new Set(raceDates ?? []), [raceDates]);
  const goalDateSet = useMemo(() => new Set(goalDates ?? []), [goalDates]);
  const today = todayKey();

  // Compute the 14-day AI coach window boundary
  const aiWindowEnd = useMemo(() => {
    if (!showAIWindow) return '';
    const d = new Date();
    d.setDate(d.getDate() + AI_WINDOW_DAYS);
    return toDateKey(d);
  }, [showAIWindow]);
  const [refDate, setRefDate] = useState(() => new Date());

  // Keep the selected date visible when it changes from outside the calendar (e.g. swiping the day detail)
  useEffect(() => {
    const selected = new Date(selectedDate + 'T12:00:00');
    setRefDate((prev) => {
      if (viewMode === 'month') {
        const sameMonth = prev.getFullYear() === selected.getFullYear() && prev.getMonth() === selected.getMonth();
        return sameMonth ? prev : selected;
      }
      const weekStart = toDateKey(getWeekDays(prev)[0]);
      const weekEnd = toDateKey(getWeekDays(prev)[6]);
      return selectedDate >= weekStart && selectedDate <= weekEnd ? prev : selected;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const monthGrid = useMemo(
    () => getMonthGrid(refDate.getFullYear(), refDate.getMonth()),
    [refDate.getFullYear(), refDate.getMonth()],
  );

  const weekDays = useMemo(
    () => getWeekDays(refDate),
    [refDate.getFullYear(), refDate.getMonth(), refDate.getDate()],
  );

  const navigatePrev = useCallback(() => {
    setRefDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setDate(d.getDate() - 7);
      }
      return d;
    });
  }, [viewMode]);

  const navigateNext = useCallback(() => {
    setRefDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() + 1);
      } else {
        d.setDate(d.getDate() + 7);
      }
      return d;
    });
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setRefDate(new Date());
    onSelectDate(todayKey());
  }, [onSelectDate]);

  const headerText = viewMode === 'month'
    ? `${MONTH_NAMES[refDate.getMonth()]} ${refDate.getFullYear()}`
    : (() => {
        const days = getWeekDays(refDate);
        const start = days[0];
        const end = days[6];
        const startMonth = MONTH_NAMES[start.getMonth()].slice(0, 3);
        const endMonth = MONTH_NAMES[end.getMonth()].slice(0, 3);
        if (startMonth === endMonth) {
          return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
        }
        return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
      })();

  // ── Swipe gesture ──
  const SWIPE_THRESHOLD = 50;
  const translateX = useSharedValue(0);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.4;
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 150 }, () => {
          runOnJS(navigateNext)();
          translateX.value = SCREEN_WIDTH;
          translateX.value = withTiming(0, { duration: 200 });
        });
      } else if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 150 }, () => {
          runOnJS(navigatePrev)();
          translateX.value = -SCREEN_WIDTH;
          translateX.value = withTiming(0, { duration: 200 });
        });
      } else {
        translateX.value = withTiming(0, { duration: 150 });
      }
    });

  const animatedGridStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Header: navigation + view toggle */}
      <View style={styles.header}>
        <TouchableOpacity onPress={navigatePrev} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity onPress={goToToday} activeOpacity={0.7}>
          <Text style={styles.headerTitle}>{headerText}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={navigateNext} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewBtn, viewMode === 'month' && styles.viewBtnActive]}
            onPress={() => onChangeViewMode('month')}
          >
            <Text style={[styles.viewBtnText, viewMode === 'month' && styles.viewBtnTextActive]}>M</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewBtn, viewMode === 'week' && styles.viewBtnActive]}
            onPress={() => onChangeViewMode('week')}
          >
            <Text style={[styles.viewBtnText, viewMode === 'week' && styles.viewBtnTextActive]}>W</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Swipeable calendar body */}
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.swipeContainer, animatedGridStyle]}>
          {/* Weekday headers (month view only) */}
          {viewMode === 'month' && (
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.weekdayLabel}>{label}</Text>
              ))}
            </View>
          )}

          {/* Month view */}
          {viewMode === 'month' && monthGrid.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((day) => {
                const key = toDateKey(day);
                const isCurrentMonth = day.getMonth() === refDate.getMonth();
                const isToday = key === today;
                const isSelected = key === selectedDate;
                const isRaceDay = raceDateSet.has(key);
                const isGoalDay = !isRaceDay && goalDateSet.has(key);
                const isInAIWindow = showAIWindow && key >= today && key <= aiWindowEnd;
                const entry = dayEntries[key];
                const dots = entry ? dotColor(entry) : [];

                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.dayCell,
                      isInAIWindow && styles.dayCellAIWindow,
                      isSelected && styles.dayCellSelected,
                      (isRaceDay || isGoalDay) && styles.dayCellRace,
                    ]}
                    onPress={() => onSelectDate(key)}
                    activeOpacity={0.6}
                  >
                    <View style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                      <Text
                        style={[
                          styles.dayText,
                          !isCurrentMonth && styles.dayTextMuted,
                          isToday && styles.dayTextToday,
                          isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </View>
                    {isRaceDay ? (
                      <View style={styles.raceBadge}>
                        <Ionicons name="flag" size={9} color={Colors.warning} />
                        <Text style={styles.raceBadgeText}>Race</Text>
                      </View>
                    ) : isGoalDay ? (
                      <View style={styles.raceBadge}>
                        <Ionicons name="speedometer" size={9} color={Colors.warning} />
                        <Text style={styles.raceBadgeText}>Goal</Text>
                      </View>
                    ) : (
                      <View style={styles.dotRow}>
                        {dots.map((color, i) => (
                          <View key={i} style={[styles.dot, { backgroundColor: color }]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Week view */}
          {viewMode === 'week' && (
            <View style={styles.weekViewRow}>
              {weekDays.map((day) => {
                const key = toDateKey(day);
                const isToday = key === today;
                const isSelected = key === selectedDate;
                const isRaceDay = raceDateSet.has(key);
                const isGoalDay = !isRaceDay && goalDateSet.has(key);
                const isInAIWindow = showAIWindow && key >= today && key <= aiWindowEnd;
                const entry = dayEntries[key];
                const primaryPw = entry?.planWorkouts?.[0];
                const dayLabel = primaryPw?.day_label;

                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.weekDayCard,
                      isInAIWindow && styles.weekDayCardAIWindow,
                      isSelected && styles.weekDayCardSelected,
                      (isRaceDay || isGoalDay) && styles.weekDayCardRace,
                    ]}
                    onPress={() => onSelectDate(key)}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.weekDayLabel, isToday && styles.weekDayLabelToday]}>
                      {WEEKDAY_LABELS[day.getDay()]}
                    </Text>
                    <View style={[styles.weekDayNumber, isToday && styles.dayNumberToday]}>
                      <Text style={[
                        styles.weekDayDateText,
                        isToday && styles.dayTextToday,
                      ]}>
                        {day.getDate()}
                      </Text>
                    </View>
                    {isRaceDay ? (
                      <View style={[styles.weekWorkoutChip, { borderLeftColor: Colors.warning }]}>
                        <View style={styles.weekRaceRow}>
                          <Ionicons name="flag" size={10} color={Colors.warning} />
                          <Text style={styles.weekRaceText}>Race Day</Text>
                        </View>
                      </View>
                    ) : isGoalDay ? (
                      <View style={[styles.weekWorkoutChip, { borderLeftColor: Colors.warning }]}>
                        <View style={styles.weekRaceRow}>
                          <Ionicons name="speedometer" size={10} color={Colors.warning} />
                          <Text style={styles.weekRaceText}>Goal Day</Text>
                        </View>
                      </View>
                    ) : dayLabel ? (
                      <View style={[
                        styles.weekWorkoutChip,
                        {
                          borderLeftColor: primaryPw?.status === 'completed'
                            ? Colors.primary
                            : Colors.accent,
                        },
                      ]}>
                        <Text style={styles.weekWorkoutType} numberOfLines={2}>
                          {dayLabel}
                        </Text>
                      </View>
                    ) : entry?.completedRuns.length ? (
                      <View style={[styles.weekWorkoutChip, { borderLeftColor: Colors.primary }]}>
                        <Text style={styles.weekWorkoutType} numberOfLines={2}>
                          {entry.completedRuns[0].workoutName}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.weekRestLabel}>Rest</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      {/* AI coach window legend */}
      {showAIWindow && (
        <View style={styles.aiWindowLegend}>
          <View style={styles.aiWindowLegendDot} />
          <Text style={styles.aiWindowLegendText}>
            AI coach adds workout details within this 2-week window
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

// Account for outer page padding (Spacing.md each side) + calendar container
// padding (Spacing.sm each side) so Saturday cells don't clip.
const CELL_SIZE = Math.floor((SCREEN_WIDTH - (Spacing.md + Spacing.sm) * 2) / 7);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  swipeContainer: {
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    minWidth: 160,
    textAlign: 'center',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    padding: 2,
    marginLeft: 'auto',
  },
  viewBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm - 2,
  },
  viewBtnActive: {
    backgroundColor: Colors.primary + '30',
  },
  viewBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  viewBtnTextActive: {
    color: Colors.primary,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  weekdayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayCellAIWindow: {
    backgroundColor: Colors.accent + '0C',
    borderRadius: BorderRadius.sm,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary + '60',
  },
  dayCellRace: {
    backgroundColor: Colors.warning + '10',
    borderRadius: BorderRadius.sm,
  },
  dayNumber: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  dayNumberToday: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  dayText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  dayTextMuted: {
    color: Colors.textMuted,
  },
  dayTextToday: {
    color: Colors.primary,
    fontWeight: '700',
  },
  dayTextSelected: {
    fontWeight: '700',
    color: Colors.primary,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  raceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 12,
  },
  raceBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Week view
  weekViewRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekDayCard: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
    minHeight: 80,
    gap: 4,
  },
  weekDayCardAIWindow: {
    backgroundColor: Colors.accent + '0C',
  },
  weekDayCardSelected: {
    backgroundColor: Colors.primary + '15',
    borderWidth: 1.5,
    borderColor: Colors.primary + '60',
  },
  weekDayCardRace: {
    backgroundColor: Colors.warning + '10',
  },
  weekDayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  weekDayLabelToday: {
    color: Colors.primary,
  },
  weekDayNumber: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  weekDayDateText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  weekWorkoutChip: {
    backgroundColor: Colors.surfaceLight,
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignSelf: 'stretch',
  },
  weekWorkoutType: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  weekRestLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  weekRaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  weekRaceText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.warning,
  },

  // AI window legend
  aiWindowLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  aiWindowLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: Colors.accent + '25',
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  aiWindowLegendText: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
});
