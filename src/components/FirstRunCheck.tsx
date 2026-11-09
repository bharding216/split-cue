/**
 * FirstRunCheck — a short checklist on the pre-run screen before someone's
 * first run, so GPS, cues, and volume problems surface before the timer starts.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AudioCueMode } from '../workout/workoutTypes';
import type { LocationAccess } from '../pace/locationPermission';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface FirstRunCheckProps {
  needsGps: boolean;
  locationAccess: LocationAccess | null;
  audioCueMode: AudioCueMode;
  onTurnOnVoice: () => void;
  onTestCue: () => void;
}

function CheckRow({
  ok,
  text,
  action,
  onAction,
}: {
  ok: boolean;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'alert-circle'}
        size={18}
        color={ok ? Colors.primary : Colors.warning}
      />
      <Text style={styles.rowText}>{text}</Text>
      {action && onAction && (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onAction}
          activeOpacity={0.7}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.actionText}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function FirstRunCheck({
  needsGps,
  locationAccess,
  audioCueMode,
  onTurnOnVoice,
  onTestCue,
}: FirstRunCheckProps) {
  const voiceOn = audioCueMode === 'voice' || audioCueMode === 'both';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Before your first run</Text>

      {needsGps && (
        <CheckRow
          ok={locationAccess === 'granted'}
          text={
            locationAccess === 'granted'
              ? 'Location is on. Start outside for the best GPS signal.'
              : 'Location is off, so distance and pace won\'t be tracked.'
          }
        />
      )}

      <CheckRow
        ok={voiceOn}
        text={voiceOn ? 'Voice cues are on.' : 'Voice cues are off. They tell you what to do as you run.'}
        action={voiceOn ? undefined : 'Turn on'}
        onAction={onTurnOnVoice}
      />

      {audioCueMode !== 'silent' && (
        <CheckRow
          ok
          text="Headphones in? Check the volume with your first cue."
          action="Play test"
          onAction={onTestCue}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  actionBtn: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '20',
  },
  actionText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
});
