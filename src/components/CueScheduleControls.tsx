/**
 * Time / distance selector shared by audio settings, pace settings, and the mid-run sheet.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type {
  CueBasis,
  CueDistancePreset,
  PaceCueFrequency,
  PaceUnit,
  ProgressCueBasis,
} from '../pace/paceTypes';
import { CUE_DISTANCE_PRESETS, cueDistanceLabel } from '../audio/cueSchedule';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';

const BASIS_LABELS: Record<ProgressCueBasis, string> = {
  auto: 'Match interval',
  time: 'By time',
  distance: 'By distance',
};

export const PROGRESS_CUE_BASES: readonly ProgressCueBasis[] = ['auto', 'time', 'distance'];

/** Step labels under 'Match interval'. Open-ended intervals such as Free Run follow the time step. */
export const AUTO_TIME_STEP_LABEL = 'Timed intervals & Free Runs, every';
export const AUTO_DISTANCE_STEP_LABEL = 'Distance intervals only, every';

export function CueBasisToggle<T extends ProgressCueBasis = CueBasis>({
  value,
  onChange,
  options = ['time', 'distance'] as T[],
}: {
  value: T;
  onChange: (basis: T) => void;
  options?: readonly T[];
}) {
  return (
    <View style={styles.row}>
      {options.map((basis) => {
        const active = value === basis;
        return (
          <TouchableOpacity
            key={basis}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => {
              hapticTap();
              onChange(basis);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {BASIS_LABELS[basis]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const PACE_CUE_FREQUENCY_OPTIONS: { value: PaceCueFrequency; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1:30' },
  { value: 120, label: '2 min' },
];

export function PaceCueFrequencyChips({
  value,
  onChange,
  options = PACE_CUE_FREQUENCY_OPTIONS,
}: {
  value: PaceCueFrequency;
  onChange: (frequency: PaceCueFrequency) => void;
  options?: readonly { value: PaceCueFrequency; label: string }[];
}) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => {
              hapticTap();
              onChange(opt.value);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function CueDistanceChips({
  value,
  unit,
  onChange,
  presets = CUE_DISTANCE_PRESETS,
}: {
  value: CueDistancePreset;
  unit: PaceUnit;
  onChange: (preset: CueDistancePreset) => void;
  presets?: readonly CueDistancePreset[];
}) {
  return (
    <View style={styles.row}>
      {presets.map((preset) => {
        const active = value === preset;
        return (
          <TouchableOpacity
            key={preset}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => {
              hapticTap();
              onChange(preset);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {cueDistanceLabel(preset, unit)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    gap: Spacing.xs,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  chipLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  chipLabelActive: { color: Colors.primary },
});
