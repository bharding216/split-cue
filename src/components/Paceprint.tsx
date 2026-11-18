/**
 * Paceprint — the visual fingerprint of a completed run.
 *
 * Renders a row of colored blocks whose heights and colors are derived
 * from real workout data. Work segments stand tall, recovery segments sit
 * low, and color encodes pace accuracy. The result is a compact, abstract
 * pattern unique to each run — recognizable at a glance like Wordle's grid.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { PaceprintData } from '../sharing/paceprint';

interface PaceprintProps {
  data: PaceprintData;
  /** Available width in points. */
  width: number;
  /** Maximum height in points. */
  height: number;
}

const GAP = 3;
const BORDER_RADIUS = 3;

/**
 * Minimum cell width in points so blocks never vanish on small patterns.
 * Cells below this width are clamped up and their neighbours shrink to fit.
 */
const MIN_CELL_WIDTH = 4;

export function Paceprint({ data, width, height }: PaceprintProps) {
  const { cells } = data;
  if (cells.length === 0) return null;

  const totalGap = GAP * (cells.length - 1);
  const availableWidth = width - totalGap;

  // Distribute width proportionally but enforce the minimum.
  const rawWidths = cells.map((c) => availableWidth * c.weight);
  const widths = clampWidths(rawWidths, availableWidth, MIN_CELL_WIDTH);

  return (
    <View style={[styles.container, { width, height }]}>
      {cells.map((cell, i) => (
        <View
          key={i}
          style={[
            styles.cell,
            {
              width: widths[i],
              height: height * cell.height,
              backgroundColor: cell.color,
              borderRadius: BORDER_RADIUS,
              marginLeft: i > 0 ? GAP : 0,
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * Clamp widths so none fall below `min`, redistributing the excess
 * proportionally from wider cells.
 */
function clampWidths(raw: number[], total: number, min: number): number[] {
  const widths = [...raw];
  let deficit = 0;
  let flexTotal = 0;

  for (let i = 0; i < widths.length; i++) {
    if (widths[i] < min) {
      deficit += min - widths[i];
      widths[i] = min;
    } else {
      flexTotal += widths[i];
    }
  }

  if (deficit > 0 && flexTotal > 0) {
    for (let i = 0; i < widths.length; i++) {
      if (widths[i] > min) {
        widths[i] -= deficit * (widths[i] / flexTotal);
        if (widths[i] < min) widths[i] = min;
      }
    }
  }

  return widths;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  cell: {},
});
