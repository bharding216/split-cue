/**
 * Vertical list whose items are reordered by dragging a grip handle.
 * Items may have different (and changing) heights.
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../constants/theme';
import { hapticCountdown, hapticTap } from '../audio/haptics';

type ItemLayout = { y: number; h: number };

/** Hold time before a drag starts, so scrolls that begin on a handle still scroll. */
const LONG_PRESS_MS = 250;

interface DragState {
  order: SharedValue<string[]>;
  layouts: SharedValue<Record<string, ItemLayout>>;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragY: SharedValue<number>;
}

interface Props<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /** `handle` is the drag grip; place it wherever the item should be grabbed from. */
  renderItem: (item: T, index: number, handle: React.ReactElement) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  gap?: number;
  /** Scroll container that should yield to the drag gesture. */
  scrollRef?: React.RefObject<any>;
  itemLabel?: (item: T, index: number) => string;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
  gap = 0,
  scrollRef,
  itemLabel,
}: Props<T>) {
  const keys = items.map(keyExtractor);
  const keysSig = keys.join('|');

  const order = useSharedValue<string[]>(keys);
  const layouts = useSharedValue<Record<string, ItemLayout>>({});
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const state = useMemo<DragState>(
    () => ({ order, layouts, activeIndex, targetIndex, dragY }),
    [order, layouts, activeIndex, targetIndex, dragY],
  );

  // New order is committed — drop all drag offsets in the same frame.
  useLayoutEffect(() => {
    order.value = keys;
    activeIndex.value = -1;
    targetIndex.value = -1;
    dragY.value = 0;
  }, [keysSig]);

  const finishDrag = useCallback((from: number, to: number) => {
    if (from === to) {
      activeIndex.value = -1;
      targetIndex.value = -1;
      dragY.value = 0;
      return;
    }
    onReorder(from, to);
  }, [onReorder]);

  // Shared value writes from JS land asynchronously, so several onLayout calls in one
  // tick can't read-modify-write `layouts.value`; accumulate here and publish a copy.
  const layoutsRef = useRef<Record<string, ItemLayout>>({});
  const setLayout = useCallback((key: string, y: number, h: number) => {
    const prev = layoutsRef.current[key];
    if (prev && prev.y === y && prev.h === h) return;
    layoutsRef.current[key] = { y, h };
    layouts.value = { ...layoutsRef.current };
  }, []);

  return (
    <View>
      {items.map((item, index) => {
        const key = keys[index];
        return (
          <DraggableItem
            key={key}
            itemKey={key}
            index={index}
            count={items.length}
            gap={gap}
            state={state}
            scrollRef={scrollRef}
            label={itemLabel?.(item, index)}
            onLayout={setLayout}
            onFinish={finishDrag}
            onMove={onReorder}
            render={(handle) => renderItem(item, index, handle)}
          />
        );
      })}
    </View>
  );
}

function DraggableItem({
  itemKey,
  index,
  count,
  gap,
  state,
  scrollRef,
  label,
  onLayout,
  onFinish,
  onMove,
  render,
}: {
  itemKey: string;
  index: number;
  count: number;
  gap: number;
  state: DragState;
  scrollRef?: React.RefObject<any>;
  label?: string;
  onLayout: (key: string, y: number, h: number) => void;
  onFinish: (from: number, to: number) => void;
  onMove: (from: number, to: number) => void;
  render: (handle: React.ReactElement) => React.ReactNode;
}) {
  const { order, layouts, activeIndex, targetIndex, dragY } = state;

  const pan = useMemo(() => {
    let g = Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_MS)
      .onStart(() => {
        if (activeIndex.value !== -1) return;
        activeIndex.value = index;
        targetIndex.value = index;
        dragY.value = 0;
        runOnJS(hapticCountdown)();
      })
      .onUpdate((e) => {
        if (activeIndex.value !== index) return;
        dragY.value = e.translationY;
        const keys = order.value;
        const all = layouts.value;
        const me = all[keys[index]];
        if (!me) return;
        const center = me.y + me.h / 2 + e.translationY;
        let t = index;
        for (let i = 0; i < keys.length; i++) {
          const l = all[keys[i]];
          if (!l || i === index) continue;
          const mid = l.y + l.h / 2;
          if (i < index && center < mid && t === index) t = i;
          if (i > index && center > mid) t = i;
        }
        if (t !== targetIndex.value) {
          targetIndex.value = t;
          runOnJS(hapticTap)();
        }
      })
      .onFinalize(() => {
        if (activeIndex.value !== index) return;
        const keys = order.value;
        const all = layouts.value;
        const me = all[keys[index]];
        const t = targetIndex.value;
        const target = all[keys[t]];
        let final = 0;
        if (me && target && t > index) final = target.y + target.h - (me.y + me.h);
        else if (me && target && t < index) final = target.y - me.y;
        dragY.value = withTiming(final, { duration: 140 }, () => {
          runOnJS(onFinish)(index, t);
        });
      });
    if (scrollRef) g = g.blocksExternalGesture(scrollRef);
    return g;
  }, [index, scrollRef, onFinish]);

  const animatedStyle = useAnimatedStyle(() => {
    const a = activeIndex.value;
    if (a < 0) {
      return { zIndex: 0, transform: [{ translateY: 0 }, { scale: 1 }], shadowOpacity: 0, elevation: 0 };
    }
    if (a === index) {
      return {
        zIndex: 10,
        transform: [{ translateY: dragY.value }, { scale: withTiming(1.03, { duration: 120 }) }],
        shadowOpacity: 0.45,
        elevation: 10,
      };
    }
    const t = targetIndex.value;
    const active = layouts.value[order.value[a]];
    const slot = active ? active.h + gap : 0;
    let shift = 0;
    if (a < index && index <= t) shift = -slot;
    else if (t <= index && index < a) shift = slot;
    return {
      zIndex: 0,
      transform: [{ translateY: withTiming(shift, { duration: 160 }) }, { scale: 1 }],
      shadowOpacity: 0,
      elevation: 0,
    };
  }, [index, gap]);

  const handle = (
    <GestureDetector gesture={pan}>
      <View
        style={styles.handle}
        hitSlop={8}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label ? `Reorder ${label}` : 'Reorder'}
        accessibilityHint="Press and hold, then drag up or down to move"
        accessibilityActions={[
          ...(index > 0 ? [{ name: 'moveUp', label: 'Move up' }] : []),
          ...(index < count - 1 ? [{ name: 'moveDown', label: 'Move down' }] : []),
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'moveUp') onMove(index, index - 1);
          if (e.nativeEvent.actionName === 'moveDown') onMove(index, index + 1);
        }}
      >
        <Ionicons name="reorder-three" size={24} color={Colors.textSecondary} />
      </View>
    </GestureDetector>
  );

  return (
    <Animated.View
      style={[styles.item, { marginBottom: gap }, animatedStyle]}
      onLayout={(e) => onLayout(itemKey, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    >
      {render(handle)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  item: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  handle: {
    width: 32,
    height: 40,
    marginLeft: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
