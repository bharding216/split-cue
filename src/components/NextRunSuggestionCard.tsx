/**
 * NextRunSuggestionCard — shown on the workout-finished screen. Suggests the
 * next run on a specific day and adds it to the training calendar in one tap.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { totalWorkoutSeconds } from '../workout/workoutTypes';
import type { NextRunSuggestion } from '../workout/nextRunSuggestion';
import { WorkoutStructure } from './WorkoutStructure';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export type SuggestionStatus = 'idle' | 'adding' | 'error' | 'signin_cancelled';

interface NextRunSuggestionCardProps {
  suggestion: NextRunSuggestion;
  signedIn: boolean;
  status: SuggestionStatus;
  onAdd: () => void;
}

function weekdayLabel(dateKey: string): string {
  return new Date(dateKey + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' });
}

export function NextRunSuggestionCard({ suggestion, signedIn, status, onAdd }: NextRunSuggestionCardProps) {
  const { workout } = suggestion;
  const secs = totalWorkoutSeconds(workout);
  const busy = status === 'adding';

  return (
    <View style={styles.card}>
      <Text style={styles.labelBadge}>NEXT RUN · {weekdayLabel(suggestion.dateKey).toUpperCase()}</Text>
      <Text style={styles.title}>{workout.name || 'Run'}</Text>
      {secs > 0 && <Text style={styles.meta}>{Math.round(secs / 60)} min</Text>}

      <View style={styles.structure}>
        <WorkoutStructure workout={workout} />
      </View>

      <Text style={styles.reason}>{suggestion.reason}</Text>
      {suggestion.tip && (
        <View style={styles.tipRow}>
          <Ionicons name="bulb-outline" size={14} color={Colors.accent} />
          <Text style={styles.tipText}>{suggestion.tip}</Text>
        </View>
      )}

      {status === 'signin_cancelled' ? (
        <Text style={styles.fallback}>
          No problem. You&apos;ll find this run under Recently Used on the home screen whenever
          you&apos;re ready.
        </Text>
      ) : (
        <TouchableOpacity
          style={[styles.addBtn, busy && styles.addBtnBusy]}
          onPress={onAdd}
          disabled={busy}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={Colors.black} />
          ) : (
            <>
              <Ionicons name="calendar" size={18} color={Colors.black} />
              <Text style={styles.addBtnText}>
                {signedIn ? `Add to calendar for ${weekdayLabel(suggestion.dateKey)}` : 'Sign in to add to calendar'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {status === 'error' && (
        <Text style={styles.error}>Couldn&apos;t add it to your calendar. Check your connection and try again.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  labelBadge: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  meta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  structure: {
    marginTop: Spacing.sm,
  },
  reason: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  addBtnBusy: {
    opacity: 0.7,
  },
  addBtnText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  fallback: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    lineHeight: 20,
  },
  error: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    marginTop: Spacing.sm,
  },
});
