/**
 * NewlyPlannedHint — shown inside a calendar workout that was just added from
 * the post-run suggestion. Explains how to start it and offers a reminder.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { hasRunReminder, scheduleRunReminder } from '../notifications/runReminders';
import { track } from '../analytics/track';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

type ReminderState = 'loading' | 'none' | 'scheduling' | 'set' | 'denied' | 'too_late';

interface NewlyPlannedHintProps {
  planWorkoutId: string;
  date: string;
  workoutName: string;
  onDismiss: () => void;
}

export function NewlyPlannedHint({ planWorkoutId, date, workoutName, onDismiss }: NewlyPlannedHintProps) {
  const [reminder, setReminder] = useState<ReminderState>('loading');

  useEffect(() => {
    let cancelled = false;
    hasRunReminder(planWorkoutId).then((has) => {
      if (!cancelled) setReminder(has ? 'set' : 'none');
    });
    return () => {
      cancelled = true;
    };
  }, [planWorkoutId]);

  const handleRemind = async () => {
    track('run_reminder_requested', { source: 'calendar_hint' });
    setReminder('scheduling');
    const result = await scheduleRunReminder(planWorkoutId, date, workoutName);
    if (result.ok) setReminder('set');
    else if (result.reason === 'denied') setReminder('denied');
    else setReminder('too_late');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={14} color={Colors.primary} />
        <Text style={styles.text}>Your next run is on the calendar. Tap Start on the day to begin.</Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {reminder === 'none' && (
        <TouchableOpacity style={styles.remindBtn} onPress={handleRemind} activeOpacity={0.8}>
          <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
          <Text style={styles.remindBtnText}>Remind me that morning</Text>
        </TouchableOpacity>
      )}
      {reminder === 'scheduling' && <ActivityIndicator color={Colors.primary} style={styles.status} />}
      {reminder === 'set' && (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
          <Text style={styles.statusText}>We&apos;ll remind you that morning.</Text>
        </View>
      )}
      {reminder === 'denied' && (
        <TouchableOpacity style={styles.statusRow} onPress={() => Linking.openSettings()} activeOpacity={0.7}>
          <Ionicons name="notifications-off-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.statusText}>Notifications are off. Turn them on in Settings to get reminders.</Text>
        </TouchableOpacity>
      )}
      {reminder === 'too_late' && (
        <Text style={[styles.statusText, styles.status]}>This run is too soon for a reminder.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary + '14',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '66',
  },
  remindBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  status: {
    alignSelf: 'flex-start',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
});
