/**
 * RecentRunsSheet — bottom sheet listing the full set of recently completed
 * workout configurations, opened from "See more" in the home screen's Recently Used section.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompletedWorkout, totalWorkoutSeconds, formatTime } from '../workout/workoutTypes';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export function formatRelativeDate(epoch: number): string {
  const diff = Date.now() - epoch;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(epoch).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface RecentRunsSheetProps {
  visible: boolean;
  runs: CompletedWorkout[];
  onOpen: (run: CompletedWorkout) => void;
  onRepeat: (run: CompletedWorkout) => void;
  onClose: () => void;
}

export function RecentRunsSheet({ visible, runs, onOpen, onRepeat, onClose }: RecentRunsSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Recently Used</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <FlatList
            style={styles.list}
            data={runs}
            keyExtractor={(run) => run.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: run }) => {
              const config = run.configuration!;
              const secs = totalWorkoutSeconds(config);
              return (
                <TouchableOpacity style={styles.card} onPress={() => onOpen(run)} activeOpacity={0.7}>
                  <View style={styles.cardMain}>
                    <Text style={styles.name} numberOfLines={1}>
                      {config.name || run.workoutName}
                    </Text>
                    <Text style={styles.meta}>
                      {secs > 0 ? formatTime(secs) : ''} {formatRelativeDate(run.completedAt)}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.repeatBtn} onPress={() => onRepeat(run)} activeOpacity={0.7}>
                    <Ionicons name="play" size={14} color={Colors.black} />
                    <Text style={styles.repeatText}>Repeat</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

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
    height: '75%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
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
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  cardMain: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  repeatText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.black,
  },
});
