/**
 * TrainingPhases — visual timeline of training plan phases.
 * Shows numbered phases with "Current" / "Upcoming" badges.
 * Supports collapsible mode with maxVisible prop.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { useLargeText, useScaledSize } from '../hooks/useLargeText';
import type { PlanOutlineWeek, PlanPhase } from '../types/database';

interface Phase {
  number: number;
  name: string;
  weekRange: string;
  status: 'completed' | 'current' | 'upcoming';
  focus?: string;
}

interface TrainingPhasesProps {
  outline: PlanOutlineWeek[] | null;
  /** Coach-written phases; when present they replace the theme-derived ones. */
  phases?: PlanPhase[] | null;
  /** Coach's plan description, shown above the phases. */
  approach?: string | null;
  currentWeekNumber: number;
  /** Max items to show when collapsed. Omit or 0 = show all (no collapse). */
  maxVisible?: number;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

function phaseStatus(firstWeek: number, lastWeek: number, currentWeek: number): Phase['status'] {
  if (currentWeek > lastWeek) return 'completed';
  if (currentWeek >= firstWeek) return 'current';
  return 'upcoming';
}

function weekRangeLabel(firstWeek: number, lastWeek: number): string {
  return firstWeek === lastWeek ? `Week ${firstWeek}` : `Weeks ${firstWeek}\u2013${lastWeek}`;
}

function coachPhases(phases: PlanPhase[], currentWeek: number): Phase[] {
  return phases.map((p, i) => ({
    number: i + 1,
    name: p.name,
    weekRange: weekRangeLabel(p.start_week, p.end_week),
    status: phaseStatus(p.start_week, p.end_week, currentWeek),
    focus: p.focus || undefined,
  }));
}

export function derivePhases(outline: PlanOutlineWeek[] | null, currentWeek: number): Phase[] {
  if (!outline || outline.length === 0) return [];

  const themeGroups: { theme: string; weeks: number[] }[] = [];
  for (const week of outline) {
    const last = themeGroups[themeGroups.length - 1];
    if (last && last.theme === week.theme) {
      last.weeks.push(week.week_number);
    } else {
      themeGroups.push({ theme: week.theme, weeks: [week.week_number] });
    }
  }

  return themeGroups.map((group, i) => {
    const firstWeek = Math.min(...group.weeks);
    const lastWeek = Math.max(...group.weeks);
    return {
      number: i + 1,
      name: group.theme,
      weekRange: weekRangeLabel(firstWeek, lastWeek),
      status: phaseStatus(firstWeek, lastWeek, currentWeek),
    };
  });
}

/** Coach-written phases when the plan has them, otherwise phases derived from week themes. */
export function resolvePhases(
  outline: PlanOutlineWeek[] | null,
  phases: PlanPhase[] | null | undefined,
  currentWeek: number,
): Phase[] {
  return phases?.length ? coachPhases(phases, currentWeek) : derivePhases(outline, currentWeek);
}

export function TrainingPhases({ outline, phases: coachWritten, approach, currentWeekNumber, maxVisible, expanded, onToggleExpanded }: TrainingPhasesProps) {
  const phases = resolvePhases(outline, coachWritten, currentWeekNumber);
  const large = useLargeText();
  const circleSize = useScaledSize(32, MaxFontScale.display);

  if (phases.length === 0) return null;

  const canCollapse = maxVisible != null && maxVisible > 0 && phases.length > maxVisible;
  const visiblePhases = canCollapse && !expanded ? phases.slice(0, maxVisible) : phases;
  const hiddenCount = canCollapse ? phases.length - maxVisible : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Training phases</Text>
      {approach ? <Text style={styles.approach}>{approach}</Text> : null}
      {visiblePhases.map((phase, i) => {
        const isLastVisible = i === visiblePhases.length - 1;
        const isLastOverall = phase.number === phases.length;
        const badge = (
          <Text style={[
            styles.phaseBadge,
            phase.status === 'current' && styles.phaseBadgeCurrent,
            phase.status === 'completed' && styles.phaseBadgeCompleted,
            large && styles.phaseBadgeLarge,
          ]}>
            {phase.status === 'current' ? 'Current' :
             phase.status === 'completed' ? 'Done' : 'Upcoming'}
          </Text>
        );
        return (
          <View key={phase.number} style={[styles.phaseRow, (!!phase.focus || large) && styles.phaseRowWithFocus]}>
            <View style={[
              styles.phaseCircle,
              { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
              phase.status === 'current' && styles.phaseCircleCurrent,
              phase.status === 'completed' && styles.phaseCircleCompleted,
            ]}>
              <Text
                style={[
                  styles.phaseNumber,
                  phase.status === 'current' && styles.phaseNumberCurrent,
                  phase.status === 'completed' && styles.phaseNumberCompleted,
                ]}
                maxFontSizeMultiplier={MaxFontScale.display}
              >
                {phase.number}
              </Text>
            </View>

            {!isLastOverall && !(isLastVisible && !expanded && canCollapse) && (
              <View style={[
                styles.phaseLine,
                { left: circleSize / 2 - 1, top: circleSize },
                (!!phase.focus || large) && styles.phaseLineStretch,
                phase.status === 'completed' && styles.phaseLineCompleted,
              ]} />
            )}

            <View style={styles.phaseInfo}>
              <Text style={[
                styles.phaseName,
                phase.status === 'current' && styles.phaseNameCurrent,
              ]}>
                {phase.name}
              </Text>
              <Text style={styles.phaseWeeks}>{phase.weekRange}</Text>
              {phase.focus ? <Text style={styles.phaseFocus}>{phase.focus}</Text> : null}
              {large && badge}
            </View>

            {!large && badge}
          </View>
        );
      })}

      {canCollapse && onToggleExpanded && (
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={onToggleExpanded}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: !!expanded }}
        >
          <Text style={styles.expandBtnText}>
            {expanded ? 'Show less' : `Show ${hiddenCount} more phase${hiddenCount !== 1 ? 's' : ''}`}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.primary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  phaseRowWithFocus: {
    alignItems: 'flex-start',
  },
  phaseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseCircleCurrent: {
    backgroundColor: Colors.primary,
  },
  phaseCircleCompleted: {
    backgroundColor: Colors.primary + '40',
  },
  phaseNumber: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textMuted,
  },
  phaseNumberCurrent: {
    color: Colors.black,
  },
  phaseNumberCompleted: {
    color: Colors.primary,
  },
  phaseLine: {
    position: 'absolute',
    left: 15,
    top: 32,
    width: 2,
    height: 24,
    backgroundColor: Colors.surfaceLight,
  },
  phaseLineStretch: {
    height: undefined,
    bottom: -Spacing.md,
  },
  phaseLineCompleted: {
    backgroundColor: Colors.primary + '40',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  phaseNameCurrent: {
    color: Colors.textPrimary,
  },
  phaseWeeks: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  phaseFocus: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 3,
  },
  approach: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  phaseBadge: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  phaseBadgeCurrent: {
    color: Colors.primary,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  phaseBadgeCompleted: {
    color: Colors.textMuted,
  },
  phaseBadgeLarge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  expandBtnText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
});
