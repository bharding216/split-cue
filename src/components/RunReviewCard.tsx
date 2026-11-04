/**
 * RunReviewCard — AI coach feedback on the most recently finished plan run,
 * with any proposed changes to upcoming workouts.
 *
 * `finished` placement (post-run screen) shows the review as it loads.
 * `training` placement only appears while proposed changes await a decision,
 * so runners who left the post-run screen early still get to review them.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTrainingPlan } from '../contexts/TrainingPlanContext';
import { ModificationReview, type ModificationItem } from './ModificationReview';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface Props {
  placement: 'finished' | 'training';
  /** Only show the review for this plan workout (post-run screen). */
  planWorkoutId?: string;
}

export function RunReviewCard({ placement, planWorkoutId }: Props) {
  const { runReview, planWorkouts, applyRunReviewChanges, dismissRunReview } = useTrainingPlan();

  const items: ModificationItem[] = useMemo(() => {
    if (!runReview) return [];
    return runReview.adjustments.map((mod) => {
      const existing = planWorkouts.find((pw) => pw.plan_id === runReview.planId && pw.date === mod.date);
      return {
        modification: mod,
        before: existing
          ? { day_label: existing.day_label ?? undefined, description: existing.description ?? undefined }
          : null,
      };
    });
  }, [runReview, planWorkouts]);

  if (!runReview) return null;
  if (planWorkoutId && runReview.planWorkoutId !== planWorkoutId) return null;
  if (placement === 'training' && runReview.decision !== 'pending') return null;
  if (runReview.status === 'error') return null;

  const { analysis } = runReview;
  const showChanges =
    items.length > 0 && (runReview.decision === 'pending' || runReview.decision === 'applied');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color={Colors.accent} />
        <Text style={styles.title}>Coach review</Text>
        {placement === 'training' && (
          <TouchableOpacity
            onPress={dismissRunReview}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dismiss coach review"
          >
            <Ionicons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {runReview.status === 'loading' && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.accent} />
          <Text style={styles.loadingText}>Your coach is reviewing this run…</Text>
        </View>
      )}

      {runReview.status === 'ready' && analysis && (
        <>
          <Text style={styles.message}>{analysis.coach_message}</Text>
          {placement === 'finished' && analysis.key_observations?.length > 0 && (
            <View style={styles.observations}>
              {analysis.key_observations.map((obs, i) => (
                <Text key={i} style={styles.observation}>• {obs}</Text>
              ))}
            </View>
          )}
          {items.length === 0 && (
            <Text style={styles.footnote}>No changes needed — your upcoming workouts stay as planned.</Text>
          )}
          {runReview.decision === 'declined' && (
            <Text style={styles.footnote}>Kept your original plan.</Text>
          )}
        </>
      )}

      {runReview.status === 'ready' && showChanges && (
        <View style={styles.changes}>
          <ModificationReview
            items={items}
            coachMessage={analysis?.plan_update?.reason}
            onApply={applyRunReviewChanges}
            onKeepOriginal={dismissRunReview}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignSelf: 'stretch',
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  observations: {
    gap: 2,
  },
  observation: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  footnote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  changes: {
    marginTop: Spacing.xs,
  },
});
