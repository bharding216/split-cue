import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  WorkoutDefinition,
  totalWorkoutSeconds,
  totalWorkoutDistanceMeters,
  formatTime,
  flattenWorkout,
  formatDistanceShort,
  hasDistanceFeature,
} from '../workout/workoutTypes';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  intervalColor,
} from '../constants/theme';
import { shareWorkoutStructure } from '../sharing/shareWorkout';
import { useUnits } from '../hooks/useUnits';

interface WorkoutCardProps {
  workout: WorkoutDefinition;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  drag: () => void;
  isActive: boolean;
}

export function WorkoutCard({
  workout,
  onStart,
  onEdit,
  onDelete,
  drag,
  isActive,
}: WorkoutCardProps) {
  const totalSecs = totalWorkoutSeconds(workout);
  const intervals = flattenWorkout(workout);
  const distMeters = totalWorkoutDistanceMeters(workout);
  const isDistance = hasDistanceFeature(workout);
  const unit = useUnits();

  const handleDelete = () => {
    Alert.alert(
      'Delete Workout',
      `Delete "${workout.name}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        if (!isActive) onEdit();
      }}
      onLongPress={drag}
      delayLongPress={200}
      style={[styles.card, isActive && styles.cardActive]}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{workout.name}</Text>
        {isDistance && distMeters ? (
          <Text style={styles.distanceBadge}>
            {formatDistanceShort(distMeters, unit)}
          </Text>
        ) : (
          <Text style={styles.duration}>{formatTime(totalSecs)}</Text>
        )}
      </View>

      {/* Mini preview of interval structure */}
      <View style={styles.preview}>
        {intervals.slice(0, 20).map((int, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: intervalColor(int.type) },
            ]}
          />
        ))}
        {intervals.length > 20 && (
          <Text style={styles.moreText}>+{intervals.length - 20}</Text>
        )}
      </View>

      {/* Summary */}
      <Text style={styles.summary}>
        {isDistance ? '📍 GPS ' : ''}
        {intervals.length} interval{intervals.length !== 1 ? 's' : ''}
        {workout.blocks.length > 0 &&
          workout.blocks[0].blockType === 'repeat' &&
          workout.blocks[0].repetitions > 1 &&
          ` · ${workout.blocks[0].repetitions}× repeat`}
        {isDistance && !workout.targetDistanceMeters && ' · distance-based'}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.startButton}
          onPress={onStart}
          activeOpacity={0.7}
        >
          <Ionicons name="play" size={16} color={Colors.black} />
          <Text style={styles.startText}>START RUN</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.black} />
        </TouchableOpacity>

        <View style={styles.secondaryActions}>
          <TouchableOpacity
            onPress={() => shareWorkoutStructure(workout)}
            style={styles.iconButton}
            hitSlop={8}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Share ${workout.name}`}
          >
            <Ionicons name="share-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onEdit}
            style={styles.iconButton}
            hitSlop={8}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${workout.name}`}
          >
            <Ionicons name="pencil-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={styles.iconButton}
            hitSlop={8}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${workout.name}`}
          >
            <Ionicons name="trash-outline" size={22} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.textMuted,
  },
  cardActive: {
    backgroundColor: Colors.surface,
    borderColor: Colors.primary,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  duration: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  distanceBadge: {
    fontSize: FontSize.md,
    color: Colors.accent,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  preview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  moreText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    alignSelf: 'center',
    marginLeft: 4,
  },
  summary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  startButton: {
    flexDirection: 'row',
    flexShrink: 1,
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm + 4,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.md - 2,
    borderRadius: BorderRadius.md,
  },
  startText: {
    flexShrink: 1,
    color: Colors.black,
    fontWeight: '800',
    fontSize: FontSize.md,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.sm + 2,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    minWidth: 42,
    minHeight: 42,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
