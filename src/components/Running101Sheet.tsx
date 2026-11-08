/**
 * Running101Sheet — bottom sheet primer on effort levels, workout types, and
 * how workouts are built. Opened from the Workouts tab.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RUNNING_101_INTRO,
  EFFORT_LEVELS,
  EFFORT_NOTE,
  WORKOUT_TYPES,
  TEMPO_VS_INTERVALS,
  TEMPO_VS_INTERVALS_TAKEAWAY,
  BUILDING_BLOCKS,
  BALANCED_WEEK,
  BALANCED_WEEK_NOTE,
} from '../content/running101';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface Running101SheetProps {
  visible: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

export function Running101Sheet({ visible, onClose }: Running101SheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Running 101</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.intro}>{RUNNING_101_INTRO}</Text>

            <Section title="How hard? The talk test">
              <View style={styles.card}>
                {EFFORT_LEVELS.map((level, i) => (
                  <View key={level.name} style={[styles.effortRow, i > 0 && styles.rowDivider]}>
                    <View style={[styles.dot, { backgroundColor: level.color }]} />
                    <Text style={styles.effortName}>{level.name}</Text>
                    <Text style={styles.effortValue}>{level.effort}</Text>
                    <Text style={styles.effortTalk}>{level.talk}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.note}>{EFFORT_NOTE}</Text>
            </Section>

            <Section title="Workout types">
              {WORKOUT_TYPES.map((type) => (
                <View key={type.name} style={styles.card}>
                  <Text style={styles.itemTitle}>{type.name}</Text>
                  <Text style={styles.itemText}>{type.summary}</Text>
                  <Text style={styles.example}>{type.example}</Text>
                </View>
              ))}
            </Section>

            <Section title="Tempo vs. intervals">
              {TEMPO_VS_INTERVALS.map((w) => (
                <View key={w.title} style={styles.card}>
                  <Text style={styles.itemTitle}>{w.title}</Text>
                  {w.steps.map((step, i) => (
                    <Text key={i} style={styles.step}>{step}</Text>
                  ))}
                  <Text style={styles.example}>{w.note}</Text>
                </View>
              ))}
              <Text style={styles.note}>{TEMPO_VS_INTERVALS_TAKEAWAY}</Text>
            </Section>

            <Section title="How workouts are built">
              <View style={styles.card}>
                {BUILDING_BLOCKS.map((block, i) => (
                  <View key={block.name} style={[styles.blockRow, i > 0 && styles.rowDivider]}>
                    <Text style={styles.itemTitle}>{block.name}</Text>
                    <Text style={styles.itemText}>{block.summary}</Text>
                  </View>
                ))}
              </View>
            </Section>

            <Section title="A balanced week">
              <View style={styles.card}>
                {BALANCED_WEEK.map((d, i) => (
                  <View key={d.day} style={[styles.weekRow, i > 0 && styles.rowDivider]}>
                    <Text style={styles.weekDay}>{d.day}</Text>
                    <Text style={styles.itemText}>{d.workout}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.note}>{BALANCED_WEEK_NOTE}</Text>
            </Section>
          </ScrollView>
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
    height: '85%',
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
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  intro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 4,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  effortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs + 2,
    gap: Spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  effortName: {
    minWidth: 72,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  effortValue: {
    minWidth: 36,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  effortTalk: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  itemTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  itemText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  example: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  step: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  blockRow: {
    paddingVertical: Spacing.xs + 2,
  },
  weekRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.xs + 2,
    gap: Spacing.md,
  },
  weekDay: {
    minWidth: 36,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  note: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
});
