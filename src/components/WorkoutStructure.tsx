/**
 * WorkoutStructure — visual breakdown of a workout's blocks.
 * Shows colored bars with segment details, targets, and durations.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { WorkoutDefinition, WorkoutBlock, Segment, RepeatGroup } from '../workout/workoutTypes';
import { formatTime, defaultSegmentLabel, segmentToIntervalType } from '../workout/workoutTypes';
import { Colors, Spacing, FontSize, BorderRadius, intervalColor } from '../constants/theme';
import type { PaceUnit } from '../pace/paceTypes';
import { useUnits } from '../hooks/useUnits';
import { formatSegmentDistance } from '../units/format';

interface WorkoutStructureProps {
  workout: WorkoutDefinition;
}

interface StructureRow {
  label: string;
  detail: string;
  color: string;
  indent?: boolean;
}

function getRows(blocks: WorkoutBlock[], unit: PaceUnit): StructureRow[] {
  const rows: StructureRow[] = [];

  for (const block of blocks) {
    if (block.blockType === 'segment') {
      rows.push(segmentRow(block, unit));
    } else {
      // RepeatGroup
      const rg = block;
      if (rg.blocks.length === 1 && rg.blocks[0].blockType === 'segment') {
        // Single-segment repeat: inline
        const seg = rg.blocks[0] as Segment;
        const label = rg.repetitions > 1
          ? `${rg.repetitions}× ${seg.label || defaultSegmentLabel(seg.segmentType)}`
          : seg.label || defaultSegmentLabel(seg.segmentType);
        rows.push({
          label: appendTarget(label, seg, unit),
          detail: seg.intensity ? seg.intensity.charAt(0).toUpperCase() + seg.intensity.slice(1) : '',
          color: intervalColor(segmentToIntervalType(seg.segmentType, seg.intensity)),
        });
      } else {
        // Multi-segment repeat: show header + inner
        const firstSeg = rg.blocks.find((b): b is Segment => b.blockType === 'segment');
        const mainLabel = firstSeg ? (firstSeg.label || defaultSegmentLabel(firstSeg.segmentType)) : 'Repeat';
        const secondSeg = rg.blocks.length > 1 ? rg.blocks.find((b, i): b is Segment => i > 0 && b.blockType === 'segment') : undefined;

        let detail = '';
        if (secondSeg) {
          const recDur = secondSeg.target.type === 'time' ? (secondSeg.target.durationSeconds ?? 0) : 0;
          if (recDur > 0) {
            detail = `${recDur}s recovery`;
          }
        }

        let label = `${rg.repetitions}× `;
        if (firstSeg) {
          label += targetString(firstSeg, unit);
        }

        rows.push({
          label: rg.name ? `${rg.name} · ${label}` : label,
          detail: detail || (firstSeg?.intensity ? firstSeg.intensity.charAt(0).toUpperCase() + firstSeg.intensity.slice(1) : ''),
          color: firstSeg ? intervalColor(segmentToIntervalType(firstSeg.segmentType, firstSeg.intensity)) : Colors.textSecondary,
        });
      }
    }
  }

  return rows;
}

function targetString(seg: Segment, unit: PaceUnit): string {
  if (seg.target.type === 'distance' && seg.target.distanceMeters) {
    return formatSegmentDistance(seg.target.distanceMeters, unit);
  }
  if (seg.target.type === 'time' && seg.target.durationSeconds) {
    return formatTime(seg.target.durationSeconds);
  }
  return 'open-ended';
}

function appendTarget(label: string, seg: Segment, unit: PaceUnit): string {
  const tgt = targetString(seg, unit);
  return tgt ? `${label} · ${tgt}` : label;
}

function segmentRow(seg: Segment, unit: PaceUnit): StructureRow {
  const label = seg.label || defaultSegmentLabel(seg.segmentType);
  return {
    label: appendTarget(label, seg, unit),
    detail: seg.intensity ? seg.intensity.charAt(0).toUpperCase() + seg.intensity.slice(1) : '',
    color: intervalColor(segmentToIntervalType(seg.segmentType, seg.intensity)),
  };
}

export function WorkoutStructure({ workout }: WorkoutStructureProps) {
  const unit = useUnits();
  const rows = getRows(workout.blocks, unit);

  if (rows.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Workout Structure</Text>
      {rows.map((row, i) => (
        <View key={i} style={[styles.segmentRow, row.indent && { marginLeft: Spacing.lg }]}>
          <View style={[styles.segmentBar, { backgroundColor: row.color }]} />
          <View style={styles.segmentInfo}>
            <Text style={styles.segmentLabel}>{row.label}</Text>
            {row.detail ? <Text style={styles.segmentDetail}>{row.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.lg },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  segmentRow: { flexDirection: 'row', alignItems: 'stretch', marginBottom: Spacing.sm, minHeight: 44 },
  segmentBar: { width: 4, borderRadius: 2, marginRight: Spacing.md },
  segmentInfo: { flex: 1, justifyContent: 'center' },
  segmentLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  segmentDetail: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
});
