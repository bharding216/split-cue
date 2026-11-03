/**
 * Universal workout editor form — flat ordered block list with segments and repeat groups.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WorkoutDefinition,
  WorkoutBlock,
  Segment,
  RepeatGroup,
  WorkoutCategory,
  SegmentType,
  Intensity,
  TargetType,
  formatTime,
  totalWorkoutSeconds,
  totalWorkoutDistanceMeters,
  formatDistanceShort,
  METERS_PER_MILE,
  METERS_PER_KM,
  hasDistanceFeature,
  categorizeWorkout,
  generateId,
  defaultSegmentLabel,
  segmentToIntervalType,
  createRepeatGroup,
  createDefaultSegment,
  SEGMENT_DEFAULTS,
  intensityToEffort,
  effortToIntensity,
} from '../workout/workoutTypes';
import { loadSettings } from '../workout/workoutStorage';
import type { PaceUnit } from '../pace/paceTypes';
import { formatPace, metersPerUnit, paceSuffix, paceToUnit } from '../units/format';
import { paceFromUnit, splitPace } from '../workout/goalPaceSuggestions';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  intervalColor,
} from '../constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { hapticTap } from '../audio/haptics';
import { DraggableList } from './DraggableList';

interface Props {
  initial: WorkoutDefinition;
  onSave: (workout: WorkoutDefinition) => void;
  onSaveAsNew?: (workout: WorkoutDefinition) => void;
  onCancel: () => void;
  autoSave?: boolean;
  isPlanWorkout?: boolean;
  sessionMode?: boolean;
  onSessionChange?: (workout: WorkoutDefinition) => void;
}

const EDIT_HINT_KEY = '@pacecue/edit_hint_shown';

export function WorkoutEditorForm({ initial, onSave, onSaveAsNew, onCancel, autoSave, isPlanWorkout, sessionMode, onSessionChange }: Props) {
  const [name, setName] = useState(initial.name);
  const [blocks, setBlocks] = useState<WorkoutBlock[]>(initial.blocks);
  const [targetDistance, setTargetDistance] = useState(initial.targetDistanceMeters ?? 0);
  const [category, setCategory] = useState<WorkoutCategory | undefined>(initial.category);
  const [paceUnit, setPaceUnit] = useState<PaceUnit>('minPerMile');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [showEditHint, setShowEditHint] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const initialSnapshot = useRef(initial);
  const scrollRef = useRef<ScrollView>(null);

  const effectiveAutoSave = autoSave && !isPlanWorkout;

  useEffect(() => {
    loadSettings().then(s => setPaceUnit(s.paceUnit));
    if (effectiveAutoSave) {
      AsyncStorage.getItem(EDIT_HINT_KEY).then((val) => {
        if (val !== 'true') {
          setShowEditHint(true);
          Animated.timing(hintOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
      });
    }
  }, []);

  const buildCurrent = useCallback((): WorkoutDefinition => ({
    ...initial,
    name,
    blocks,
    targetDistanceMeters: targetDistance > 0 ? targetDistance : undefined,
    category,
  }), [initial, name, blocks, targetDistance, category]);

  const current = buildCurrent();

  // Auto-save with debounce
  useEffect(() => {
    if (!effectiveAutoSave) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setHasEdits(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!name.trim()) return;
      onSave(buildCurrent());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [name, blocks, targetDistance, category, effectiveAutoSave]);

  // Track edits for plan / session mode
  useEffect(() => {
    if (!isPlanWorkout && !sessionMode) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setHasEdits(true);
  }, [name, blocks, targetDistance, category]);

  // Report changes in session mode
  useEffect(() => {
    if (!sessionMode || !onSessionChange) return;
    onSessionChange(buildCurrent());
  }, [name, blocks, targetDistance, category, sessionMode]);

  const dismissEditHint = useCallback(() => {
    Animated.timing(hintOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowEditHint(false);
      AsyncStorage.setItem(EDIT_HINT_KEY, 'true');
    });
  }, [hintOpacity]);

  const handleRevert = useCallback(() => {
    const snap = initialSnapshot.current;
    Alert.alert(
      'Revert Changes',
      'Undo all edits and restore this workout to its original state?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revert',
          style: 'destructive',
          onPress: () => {
            setName(snap.name);
            setBlocks(snap.blocks);
            setTargetDistance(snap.targetDistanceMeters ?? 0);
            setCategory(snap.category);
            setHasEdits(false);
            if (effectiveAutoSave) {
              onSave({ ...snap, updatedAt: Date.now() } as any);
              setSaveStatus('saved');
              setTimeout(() => setSaveStatus('idle'), 1500);
            }
          },
        },
      ],
    );
  }, [effectiveAutoSave, onSave]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Give your workout a name.');
      return;
    }
    onSave(current);
  };

  const handleSaveAsNew = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Give your workout a name.');
      return;
    }
    onSaveAsNew?.(current);
  };

  // ── Block CRUD ─────────────────────────────────────────────

  const updateBlock = (index: number, updater: (b: WorkoutBlock) => WorkoutBlock) => {
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = updater(next[index]);
      return next;
    });
  };

  const removeBlock = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const moveBlock = useCallback((from: number, to: number) => {
    setBlocks((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const toggleExpanded = (id: string) => {
    hapticTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const addSegment = (type: SegmentType) => {
    hapticTap();
    const seg = createDefaultSegment(type);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBlocks((prev) => [...prev, seg]);
    setExpandedId(seg.id);
    setAddPickerOpen(false);
  };

  const addRepeatGroup = () => {
    hapticTap();
    const rg = createRepeatGroup();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBlocks((prev) => [...prev, rg]);
    setExpandedId(rg.id);
    setAddPickerOpen(false);
  };

  const convertToRepeatGroup = (index: number) => {
    hapticTap();
    const block = blocks[index];
    if (block.blockType !== 'segment') return;
    const rg: RepeatGroup = {
      id: generateId(),
      blockType: 'repeat',
      repetitions: 4,
      blocks: [block, createDefaultSegment('recovery')],
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBlocks((prev) => prev.map((b, i) => (i === index ? rg : b)));
    setExpandedId(rg.id);
  };

  const ungroupRepeat = (index: number) => {
    hapticTap();
    const block = blocks[index];
    if (block.blockType !== 'repeat') return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBlocks((prev) => [...prev.slice(0, index), ...block.blocks, ...prev.slice(index + 1)]);
    setExpandedId(block.blocks.length === 1 ? block.blocks[0].id : null);
  };

  // ── Nested block updates inside repeat groups ──────────────

  const updateNestedBlock = (rgIndex: number, innerIndex: number, updater: (b: WorkoutBlock) => WorkoutBlock) => {
    updateBlock(rgIndex, (b) => {
      if (b.blockType !== 'repeat') return b;
      const newBlocks = [...b.blocks];
      newBlocks[innerIndex] = updater(newBlocks[innerIndex]);
      return { ...b, blocks: newBlocks };
    });
  };

  const removeNestedBlock = (rgIndex: number, innerIndex: number) => {
    updateBlock(rgIndex, (b) => {
      if (b.blockType !== 'repeat') return b;
      const newBlocks = b.blocks.filter((_, i) => i !== innerIndex);
      if (newBlocks.length === 0) return b; // don't remove last
      return { ...b, blocks: newBlocks };
    });
  };

  const addNestedSegment = (rgIndex: number, seg: Segment) => {
    hapticTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    updateBlock(rgIndex, (b) => {
      if (b.blockType !== 'repeat') return b;
      return { ...b, blocks: [...b.blocks, seg] };
    });
  };

  const moveNestedBlock = (rgIndex: number, from: number, to: number) => {
    updateBlock(rgIndex, (b) => {
      if (b.blockType !== 'repeat') return b;
      if (to < 0 || to >= b.blocks.length) return b;
      const newBlocks = [...b.blocks];
      const [moved] = newBlocks.splice(from, 1);
      newBlocks.splice(to, 0, moved);
      return { ...b, blocks: newBlocks };
    });
  };

  return (
    <View style={styles.container}>
      {/* Auto-save header */}
      {effectiveAutoSave && !sessionMode && (
        <View style={styles.autoSaveHeader}>
          <View style={styles.autoSaveStatus}>
            {saveStatus === 'saved' ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                <Text style={styles.autoSaveText}>Saved</Text>
              </>
            ) : (
              <Text style={styles.autoSaveTextIdle}>Auto-saves as you edit</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {hasEdits && (
              <TouchableOpacity style={styles.revertHeaderBtn} onPress={handleRevert} activeOpacity={0.7}>
                <Ionicons name="arrow-undo-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.revertHeaderText}>Revert</Text>
              </TouchableOpacity>
            )}
            {onSaveAsNew && (
              <TouchableOpacity style={styles.saveAsNewHeaderBtn} onPress={handleSaveAsNew} activeOpacity={0.7}>
                <Ionicons name="copy-outline" size={14} color={Colors.accent} />
                <Text style={styles.saveAsNewHeaderText}>New Template</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {isPlanWorkout && !sessionMode && (
        <View style={styles.planWorkoutHeader}>
          <View style={styles.planWorkoutBadge}>
            <Ionicons name="calendar-outline" size={14} color={Colors.accent} />
            <Text style={styles.planWorkoutBadgeText}>Plan Workout</Text>
          </View>
          <Text style={styles.planWorkoutHint}>
            Edit freely — changes won't affect your plan until you save.
          </Text>
        </View>
      )}

      {showEditHint && effectiveAutoSave && !sessionMode && (
        <Animated.View style={[styles.editHintBar, { opacity: hintOpacity }]}>
          <View style={styles.editHintContent}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
            <Text style={styles.editHintText}>
              Edits save over the original template. Tap <Text style={{ fontWeight: '700' }}>New Template</Text> to keep both.
            </Text>
          </View>
          <TouchableOpacity onPress={dismissEditHint} hitSlop={8}>
            <Ionicons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView ref={scrollRef} style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Text style={styles.label}>Workout Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. 5K Speed"
          placeholderTextColor={Colors.textMuted}
        />

        {/* Blocks */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workout Blocks</Text>
          {blocks.length > 1 && (
            <View style={styles.reorderHint}>
              <Ionicons name="reorder-three" size={16} color={Colors.textMuted} />
              <Text style={styles.reorderHintText}>Hold & drag to reorder</Text>
            </View>
          )}
        </View>

        <DraggableList
          items={blocks}
          keyExtractor={(b) => b.id}
          onReorder={moveBlock}
          gap={Spacing.sm}
          scrollRef={scrollRef}
          itemLabel={(b) => (b.blockType === 'segment' ? b.label || defaultSegmentLabel(b.segmentType) : `Repeat ${b.repetitions}×`)}
          renderItem={(block, bi, handle) => {
            const isOpen = expandedId === block.id;
            return (
              <View style={[styles.blockCard, isOpen && styles.blockCardOpen]}>
                {block.blockType === 'segment' ? (
                  <SegmentSummaryRow
                    segment={block}
                    paceUnit={paceUnit}
                    expanded={isOpen}
                    onPress={() => toggleExpanded(block.id)}
                    handle={blocks.length > 1 ? handle : undefined}
                  />
                ) : (
                  <RepeatSummaryRow
                    group={block}
                    paceUnit={paceUnit}
                    expanded={isOpen}
                    onPress={() => toggleExpanded(block.id)}
                    handle={blocks.length > 1 ? handle : undefined}
                  />
                )}

                {isOpen && (
                  <View style={styles.blockBody}>
                    {block.blockType === 'segment' ? (
                      <SegmentEditor
                        segment={block}
                        onChange={(updated) => updateBlock(bi, () => updated)}
                        paceUnit={paceUnit}
                      />
                    ) : (
                      <RepeatGroupEditor
                        group={block}
                        onChangeReps={(reps) => updateBlock(bi, (b) => b.blockType === 'repeat' ? { ...b, repetitions: Math.max(1, reps) } : b)}
                        onUpdateInner={(ii, updater) => updateNestedBlock(bi, ii, updater)}
                        onRemoveInner={(ii) => removeNestedBlock(bi, ii)}
                        onAddInner={(seg) => addNestedSegment(bi, seg)}
                        onMoveInner={(from, to) => moveNestedBlock(bi, from, to)}
                        paceUnit={paceUnit}
                        scrollRef={scrollRef}
                      />
                    )}

                    {/* Block toolbar — convert, remove */}
                    <View style={styles.blockToolbar}>
                      <View style={styles.blockToolbarRight}>
                        {block.blockType === 'segment' ? (
                          <TouchableOpacity onPress={() => convertToRepeatGroup(bi)} hitSlop={8} style={styles.toolbarBtn}>
                            <Ionicons name="repeat-outline" size={16} color={Colors.textMuted} />
                            <Text style={styles.toolbarBtnText}>Repeat</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => ungroupRepeat(bi)} hitSlop={8} style={styles.toolbarBtn}>
                            <Ionicons name="git-merge-outline" size={16} color={Colors.textMuted} />
                            <Text style={styles.toolbarBtnText}>Ungroup</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => removeBlock(bi)} hitSlop={8} style={styles.toolbarBtn}>
                          <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                          <Text style={styles.toolbarBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />

        {/* Add buttons */}
        {addPickerOpen ? (
          <SegmentTypePicker
            onPick={addSegment}
            onCancel={() => setAddPickerOpen(false)}
          />
        ) : (
          <View style={styles.addRow}>
            <TouchableOpacity style={styles.addBtn} onPress={() => { hapticTap(); setAddPickerOpen(true); }}>
              <Ionicons name="add-outline" size={16} color={Colors.accent} />
              <Text style={styles.addBtnText}>Add Block</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={addRepeatGroup}>
              <Ionicons name="repeat-outline" size={16} color={Colors.accent} />
              <Text style={styles.addBtnText}>Add Repeat Group</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Workout options — target distance + category */}
        <WorkoutOptions
          open={optionsOpen}
          onToggle={() => {
            hapticTap();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setOptionsOpen((o) => !o);
          }}
          targetDistance={targetDistance}
          onChangeTargetDistance={setTargetDistance}
          inferredCategory={categorizeWorkout({ ...current, category: undefined })}
          category={category}
          onChangeCategory={setCategory}
          paceUnit={paceUnit}
        />

        {/* Total */}
        {(category ?? categorizeWorkout(current)) === 'race' ? (
          totalWorkoutDistanceMeters(current) != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Target Distance</Text>
              <Text style={[styles.totalValue, { color: Colors.accent }]}>
                {formatDistanceShort(totalWorkoutDistanceMeters(current)!, paceUnit)}
              </Text>
            </View>
          )
        ) : (
          <>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Duration</Text>
              <Text style={styles.totalValue}>{formatTime(totalWorkoutSeconds(current))}</Text>
            </View>
            {totalWorkoutDistanceMeters(current) != null && (
              <View style={[styles.totalRow, { marginTop: Spacing.sm }]}>
                <Text style={styles.totalLabel}>Target Distance</Text>
                <Text style={[styles.totalValue, { color: Colors.accent }]}>
                  {formatDistanceShort(totalWorkoutDistanceMeters(current)!, paceUnit)}
                </Text>
              </View>
            )}
          </>
        )}

        {/* Actions — new template */}
        {!autoSave && !isPlanWorkout && !sessionMode && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Ionicons name="bookmark-outline" size={18} color={Colors.black} />
              <Text style={styles.saveBtnText}>Save Template</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Actions — plan workout → update the calendar entry, optionally copy to templates */}
        {isPlanWorkout && !sessionMode && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Ionicons name="checkmark" size={18} color={Colors.black} />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
            {onSaveAsNew && (
              <TouchableOpacity style={styles.saveAsNewBtn} onPress={handleSaveAsNew} activeOpacity={0.8}>
                <Ionicons name="bookmark-outline" size={18} color={Colors.accent} />
                <Text style={styles.saveAsNewBtnText}>Save to Templates</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Segment Editor ───────────────────────────────────────────────────

const SEGMENT_TYPES: { value: SegmentType; label: string }[] = [
  { value: 'warmup', label: 'Warmup' },
  { value: 'run', label: 'Run' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'rest', label: 'Rest' },
  { value: 'cooldown', label: 'Cooldown' },
];

const INTENSITY_LEVELS: { value: Intensity; label: string; color: string }[] = [
  { value: 'recovery', label: 'Recovery', color: Colors.accent },
  { value: 'easy', label: 'Easy', color: Colors.accent },
  { value: 'moderate', label: 'Moderate', color: '#F59E0B' },
  { value: 'tempo', label: 'Tempo', color: '#F97316' },
  { value: 'hard', label: 'Hard', color: Colors.danger },
  { value: 'sprint', label: 'Sprint', color: Colors.danger },
];

function segmentColor(seg: Segment): string {
  return intervalColor(segmentToIntervalType(seg.segmentType, seg.intensity));
}

const TARGET_LABELS: Record<TargetType, string> = {
  time: 'Time',
  distance: 'Distance',
  manual: 'Open-ended',
};

const TARGET_ICONS = {
  time: 'time-outline',
  distance: 'navigate-outline',
  manual: 'hand-left-outline',
} as const;

const TARGET_DESCRIPTIONS: Record<TargetType, string> = {
  time: 'Run for a set time',
  distance: 'Run a set distance (GPS)',
  manual: 'Ends when you tap Skip',
};

function intensityLabel(intensity: Intensity): string {
  return INTENSITY_LEVELS.find((il) => il.value === intensity)?.label ?? intensity;
}

function targetSummary(seg: Segment, paceUnit: PaceUnit): string {
  switch (seg.target.type) {
    case 'time': return formatTime(seg.target.durationSeconds ?? 0);
    case 'distance': return formatDistanceShort(seg.target.distanceMeters ?? 0, paceUnit);
    case 'manual': return 'Open-ended';
  }
}

/** One-line description of a segment, e.g. "10:00 · Easy" or "1.00 mi · Tempo · RPE 8". */
function summarizeSegment(seg: Segment, paceUnit: PaceUnit): string {
  const parts = [targetSummary(seg, paceUnit)];
  if (seg.intensity) parts.push(intensityLabel(seg.intensity));
  if (seg.effort != null && seg.effort !== intensityToEffort(seg.intensity)) parts.push(`RPE ${seg.effort}`);
  if (seg.targetPace != null) parts.push(formatPace(seg.targetPace, paceUnit));
  return parts.join(' · ');
}

function SegmentSummaryRow({
  segment,
  paceUnit,
  expanded,
  onPress,
  handle,
}: {
  segment: Segment;
  paceUnit: PaceUnit;
  expanded: boolean;
  onPress: () => void;
  handle?: React.ReactNode;
}) {
  return (
    <View style={sumStyles.row}>
      {handle}
      <TouchableOpacity style={sumStyles.pressArea} onPress={onPress} activeOpacity={0.7}>
        <View style={[sumStyles.dot, { backgroundColor: segmentColor(segment) }]} />
        <View style={sumStyles.textCol}>
          <Text style={sumStyles.title} numberOfLines={1}>
            {segment.label || defaultSegmentLabel(segment.segmentType)}
          </Text>
          <Text style={sumStyles.detail} numberOfLines={1}>{summarizeSegment(segment, paceUnit)}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function RepeatSummaryRow({
  group,
  paceUnit,
  expanded,
  onPress,
  handle,
}: {
  group: RepeatGroup;
  paceUnit: PaceUnit;
  expanded: boolean;
  onPress: () => void;
  handle?: React.ReactNode;
}) {
  return (
    <View style={sumStyles.row}>
      {handle}
      <TouchableOpacity style={sumStyles.pressColumn} onPress={onPress} activeOpacity={0.7}>
        <View style={sumStyles.pressArea}>
          <Ionicons name="repeat-outline" size={16} color={Colors.primary} />
          <View style={sumStyles.textCol}>
            <Text style={[sumStyles.title, { color: Colors.primary }]} numberOfLines={1}>
              Repeat {group.repetitions}×{group.name ? ` · ${group.name}` : ''}
            </Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={18} color={Colors.textMuted} />
        </View>
        {!expanded && group.blocks.map((inner) =>
          inner.blockType === 'segment' ? (
            <View key={inner.id} style={sumStyles.innerLine}>
              <View style={[sumStyles.smallDot, { backgroundColor: segmentColor(inner) }]} />
              <Text style={sumStyles.innerText} numberOfLines={1}>
                {inner.label || defaultSegmentLabel(inner.segmentType)}
                <Text style={sumStyles.detail}>  {summarizeSegment(inner, paceUnit)}</Text>
              </Text>
            </View>
          ) : null,
        )}
      </TouchableOpacity>
    </View>
  );
}

function SegmentTypePicker({ onPick, onCancel }: { onPick: (t: SegmentType) => void; onCancel: () => void }) {
  return (
    <View style={sumStyles.pickerBox}>
      <View style={sumStyles.pickerHeader}>
        <Text style={segStyles.sectionLabel}>ADD BLOCK</Text>
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <Ionicons name="close" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={segStyles.typeRow}>
        {SEGMENT_TYPES.map((st) => {
          const c = intervalColor(segmentToIntervalType(st.value));
          return (
            <TouchableOpacity
              key={st.value}
              style={[segStyles.typeChip, { borderColor: c + '66' }]}
              onPress={() => onPick(st.value)}
              activeOpacity={0.7}
            >
              <Text style={[segStyles.typeChipText, { color: c }]}>{st.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SegmentEditor({
  segment,
  onChange,
  paceUnit,
}: {
  segment: Segment;
  onChange: (s: Segment) => void;
  paceUnit: PaceUnit;
}) {
  const autoEffort = intensityToEffort(segment.intensity);
  const hasCustomEffort = segment.effort != null && segment.effort !== autoEffort;
  const [showMore, setShowMore] = useState(
    segment.targetPace != null || !!segment.label || hasCustomEffort,
  );
  const [showLabel, setShowLabel] = useState(!!segment.label);

  const update = (partial: Partial<Segment>) => onChange({ ...segment, ...partial });

  const changeType = (next: SegmentType) => {
    const prevDefault = SEGMENT_DEFAULTS[segment.segmentType].intensity;
    const untouched =
      segment.targetPace == null &&
      segment.intensity === prevDefault &&
      !hasCustomEffort;
    if (untouched) {
      const nextIntensity = SEGMENT_DEFAULTS[next].intensity;
      update({ segmentType: next, intensity: nextIntensity, effort: intensityToEffort(nextIntensity) });
    } else {
      update({ segmentType: next });
    }
  };

  return (
    <View style={segStyles.container}>
      {/* Segment type */}
      <Text style={segStyles.sectionLabel}>TYPE</Text>
      <View style={segStyles.typeRow}>
        {SEGMENT_TYPES.map((st) => {
          const isActive = segment.segmentType === st.value;
          const c = intervalColor(segmentToIntervalType(st.value));
          return (
            <TouchableOpacity
              key={st.value}
              style={[segStyles.typeChip, isActive && { backgroundColor: c + '22', borderColor: c }]}
              onPress={() => {
                hapticTap();
                changeType(st.value);
              }}
              activeOpacity={0.7}
            >
              <Text style={[segStyles.typeChipText, isActive && { color: c }]}>{st.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Duration */}
      <Text style={segStyles.sectionLabel}>DURATION</Text>
      <TargetEditor segment={segment} onChange={onChange} paceUnit={paceUnit} />

      {/* Intensity */}
      <View style={segStyles.intensityHeader}>
        <Text style={segStyles.sectionLabel}>INTENSITY</Text>
        {segment.effort != null || autoEffort != null ? (
          <Text style={segStyles.rpeHint}>
            RPE {segment.effort ?? autoEffort} {hasCustomEffort ? '(custom)' : '(auto)'}
          </Text>
        ) : segment.targetPace != null ? (
          <Text style={segStyles.rpeHint}>Using target pace</Text>
        ) : null}
      </View>
      <View style={segStyles.intensityRow}>
        {INTENSITY_LEVELS.map((il) => {
          const isActive = segment.intensity === il.value;
          return (
            <TouchableOpacity
              key={il.value}
              style={[segStyles.intensityChip, isActive && { backgroundColor: il.color + '22', borderColor: il.color }]}
              onPress={() => {
                hapticTap();
                if (isActive) {
                  update({ intensity: undefined, effort: undefined, targetPace: segment.targetPace });
                } else {
                  update({ intensity: il.value, effort: intensityToEffort(il.value), targetPace: undefined });
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[segStyles.intensityText, isActive && { color: il.color }]}>{il.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* More options — RPE override, target pace, custom label */}
      <TouchableOpacity
        style={segStyles.moreToggle}
        onPress={() => {
          hapticTap();
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setShowMore((s) => !s);
        }}
        activeOpacity={0.7}
      >
        <Text style={segStyles.moreToggleText}>More options</Text>
        <Ionicons name={showMore ? 'chevron-down' : 'chevron-forward'} size={14} color={Colors.textMuted} />
      </TouchableOpacity>

      {showMore && (
        <View style={segStyles.moreBox}>
          <Text style={segStyles.sectionLabel}>CUSTOM RPE</Text>
          <Text style={segStyles.sectionHint}>Override the intensity's default effort (1–10)</Text>
          <View style={segStyles.effortNumberRow}>
            {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((n) => {
              const currentEffort = segment.effort ?? autoEffort;
              const isActive = currentEffort === n;
              const effortColor = n <= 3 ? Colors.accent : n <= 6 ? '#F59E0B' : Colors.danger;
              return (
                <TouchableOpacity
                  key={n}
                  style={[segStyles.effortNumBtn, isActive && { backgroundColor: effortColor + '22', borderColor: effortColor }]}
                  onPress={() => {
                    hapticTap();
                    update({ effort: n, intensity: effortToIntensity(n), targetPace: undefined });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[segStyles.effortNumText, isActive && { color: effortColor, fontWeight: '800' }]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Pace — alternative to named intensity */}
          {!segment.intensity && !segment.effort && (
            <PacePicker
              targetPace={segment.targetPace}
              onChange={(p) => update({ targetPace: p })}
              paceUnit={paceUnit}
            />
          )}
          {(segment.intensity || segment.effort) && segment.targetPace == null && (
            <TouchableOpacity
              onPress={() => { hapticTap(); update({ intensity: undefined, effort: undefined }); }}
              style={segStyles.paceSwitchBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="speedometer-outline" size={16} color={Colors.accent} />
              <Text style={segStyles.paceSwitchText}>Use target pace instead</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
            </TouchableOpacity>
          )}

          {showLabel ? (
            <View style={segStyles.labelRow}>
              <TextInput
                style={segStyles.labelInput}
                value={segment.label ?? ''}
                onChangeText={(text) => update({ label: text || undefined })}
                placeholder={defaultSegmentLabel(segment.segmentType)}
                placeholderTextColor={Colors.textMuted}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => { update({ label: undefined }); setShowLabel(false); }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setShowLabel(true)} style={segStyles.addLabelBtn}>
              <Ionicons name="pricetag-outline" size={12} color={Colors.textMuted} />
              <Text style={segStyles.addLabelText}>Custom label</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── Target Editor (time / distance / manual) ─────────────────────────

function TargetEditor({
  segment,
  onChange,
  paceUnit,
}: {
  segment: Segment;
  onChange: (s: Segment) => void;
  paceUnit: PaceUnit;
}) {
  const color = segmentColor(segment);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = segment.target.type;

  const selectType = (tt: TargetType) => {
    hapticTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMenuOpen(false);
    if (tt === current) return;
    if (tt === 'time') {
      onChange({ ...segment, target: { type: 'time', durationSeconds: segment.target.durationSeconds ?? SEGMENT_DEFAULTS[segment.segmentType].durationSeconds } });
    } else if (tt === 'distance') {
      onChange({ ...segment, target: { type: 'distance', distanceMeters: segment.target.distanceMeters ?? metersPerUnit(paceUnit) } });
    } else {
      onChange({ ...segment, target: { type: 'manual' } });
    }
  };

  return (
    <View style={targetStyles.container}>
      <View style={targetStyles.row}>
        {current === 'time' && (
          <DurationPicker
            seconds={segment.target.durationSeconds ?? 180}
            onChange={(s) => onChange({ ...segment, target: { type: 'time', durationSeconds: s } })}
            color={color}
          />
        )}
        {current === 'distance' && (
          <DistancePicker
            meters={segment.target.distanceMeters ?? metersPerUnit(paceUnit)}
            onChange={(m) => onChange({ ...segment, target: { type: 'distance', distanceMeters: m } })}
            color={color}
            paceUnit={paceUnit}
          />
        )}
        {current === 'manual' && (
          <View style={targetStyles.manualPill}>
            <Text style={targetStyles.manualHint}>{TARGET_DESCRIPTIONS.manual}</Text>
          </View>
        )}

        <TouchableOpacity
          style={targetStyles.typePill}
          onPress={() => {
            hapticTap();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setMenuOpen((o) => !o);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name={TARGET_ICONS[current]} size={14} color={Colors.primary} />
          <Text style={targetStyles.typePillText}>{TARGET_LABELS[current]}</Text>
          <Ionicons name={menuOpen ? 'chevron-up' : 'chevron-down'} size={12} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {menuOpen && (
        <View style={targetStyles.menu}>
          {(['time', 'distance', 'manual'] as TargetType[]).map((tt) => {
            const isActive = current === tt;
            return (
              <TouchableOpacity
                key={tt}
                style={[targetStyles.menuItem, isActive && targetStyles.menuItemActive]}
                onPress={() => selectType(tt)}
                activeOpacity={0.7}
              >
                <Ionicons name={TARGET_ICONS[tt]} size={16} color={isActive ? Colors.primary : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[targetStyles.menuLabel, isActive && { color: Colors.primary }]}>{TARGET_LABELS[tt]}</Text>
                  <Text style={targetStyles.menuDesc}>{TARGET_DESCRIPTIONS[tt]}</Text>
                </View>
                {isActive && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Repeat Group Editor ──────────────────────────────────────────────

function RepeatGroupEditor({
  group,
  onChangeReps,
  onUpdateInner,
  onRemoveInner,
  onAddInner,
  onMoveInner,
  paceUnit,
  scrollRef,
}: {
  group: RepeatGroup;
  onChangeReps: (n: number) => void;
  onUpdateInner: (idx: number, updater: (b: WorkoutBlock) => WorkoutBlock) => void;
  onRemoveInner: (idx: number) => void;
  onAddInner: (seg: Segment) => void;
  onMoveInner: (from: number, to: number) => void;
  paceUnit: PaceUnit;
  scrollRef: React.RefObject<any>;
}) {
  const [expandedInnerId, setExpandedInnerId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleInner = (id: string) => {
    hapticTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedInnerId((prev) => (prev === id ? null : id));
  };

  const addInner = (type: SegmentType) => {
    const seg = createDefaultSegment(type);
    onAddInner(seg);
    setExpandedInnerId(seg.id);
    setPickerOpen(false);
  };

  return (
    <View style={rgStyles.container}>
      {/* Header: reps */}
      <View style={rgStyles.header}>
        <Text style={segStyles.sectionLabel}>REPETITIONS</Text>
        <View style={styles.repeatRow}>
          <TouchableOpacity onPress={() => { hapticTap(); onChangeReps(group.repetitions - 1); }} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.repeatCount}>{group.repetitions}×</Text>
          <TouchableOpacity onPress={() => { hapticTap(); onChangeReps(group.repetitions + 1); }} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Nested blocks */}
      <DraggableList
        items={group.blocks}
        keyExtractor={(b) => b.id}
        onReorder={onMoveInner}
        gap={Spacing.sm}
        scrollRef={scrollRef}
        itemLabel={(b) => (b.blockType === 'segment' ? b.label || defaultSegmentLabel(b.segmentType) : 'Nested repeat')}
        renderItem={(inner, ii, handle) => {
          if (inner.blockType !== 'segment') {
            return (
              <View style={rgStyles.innerBlock}>
                <Text style={rgStyles.nestedRepeat}>Nested repeat groups not supported in editor</Text>
              </View>
            );
          }
          const isOpen = expandedInnerId === inner.id;
          return (
            <View style={rgStyles.innerBlock}>
              <SegmentSummaryRow
                segment={inner}
                paceUnit={paceUnit}
                expanded={isOpen}
                onPress={() => toggleInner(inner.id)}
                handle={group.blocks.length > 1 ? handle : undefined}
              />
              {isOpen && (
                <View style={rgStyles.innerBody}>
                  <SegmentEditor
                    segment={inner}
                    onChange={(updated) => onUpdateInner(ii, () => updated)}
                    paceUnit={paceUnit}
                  />
                  <View style={styles.blockToolbar}>
                    <TouchableOpacity
                      onPress={() => onRemoveInner(ii)}
                      disabled={group.blocks.length <= 1}
                      hitSlop={8}
                      style={styles.toolbarBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color={group.blocks.length <= 1 ? Colors.surfaceLight : Colors.textMuted} />
                      <Text style={[styles.toolbarBtnText, group.blocks.length <= 1 && { color: Colors.surfaceLight }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />

      {pickerOpen ? (
        <SegmentTypePicker onPick={addInner} onCancel={() => setPickerOpen(false)} />
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => { hapticTap(); setPickerOpen(true); }}>
          <Ionicons name="add-outline" size={14} color={Colors.accent} />
          <Text style={styles.addBtnText}>Add Segment</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Pace picker ──────────────────────────────────────────────────────

function PacePicker({
  targetPace,
  onChange,
  paceUnit,
}: {
  /** Stored in min/mile; shown and edited in `paceUnit`. */
  targetPace?: number;
  onChange: (p: number | undefined) => void;
  paceUnit: PaceUnit;
}) {
  const [editing, setEditing] = useState(false);
  const [editMins, setEditMins] = useState('');
  const [editSecs, setEditSecs] = useState('');

  const startEdit = () => {
    if (targetPace != null) {
      const { min, sec } = splitPace(paceToUnit(targetPace, paceUnit));
      setEditMins(min.toString());
      setEditSecs(sec.toString().padStart(2, '0'));
    } else {
      setEditMins(paceUnit === 'minPerKm' ? '5' : '8');
      setEditSecs('00');
    }
    setEditing(true);
  };

  const confirm = () => {
    const m = parseInt(editMins, 10) || 0;
    const s = parseInt(editSecs, 10) || 0;
    if (m === 0 && s === 0) {
      onChange(undefined);
    } else {
      onChange(paceFromUnit(m + Math.min(59, s) / 60, paceUnit));
    }
    setEditing(false);
  };

  return (
    <View style={styles.toggleGroupBox}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.toggleGroupLabel}>TARGET PACE</Text>
        {targetPace == null && !editing && (
          <TouchableOpacity onPress={startEdit} activeOpacity={0.7}>
            <Text style={{ fontSize: FontSize.xs, color: Colors.accent, fontWeight: '600' }}>+ Set pace</Text>
          </TouchableOpacity>
        )}
      </View>
      {editing ? (
        <View style={ipStyles.paceEditRow}>
          <TextInput
            style={ipStyles.paceInput}
            value={editMins}
            onChangeText={setEditMins}
            keyboardType="number-pad"
            maxLength={2}
            selectTextOnFocus
            autoFocus
            placeholder="M"
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={ipStyles.paceColon}>:</Text>
          <TextInput
            style={ipStyles.paceInput}
            value={editSecs}
            onChangeText={setEditSecs}
            keyboardType="number-pad"
            maxLength={2}
            selectTextOnFocus
            placeholder="SS"
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={ipStyles.paceUnit}>{paceSuffix(paceUnit)}</Text>
          <TouchableOpacity onPress={confirm} style={ipStyles.paceDoneBtn}>
            <Ionicons name="checkmark" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      ) : targetPace != null ? (
        <View style={ipStyles.paceDisplayRow}>
          <Ionicons name="speedometer-outline" size={14} color={Colors.accent} />
          <TouchableOpacity onPress={startEdit} activeOpacity={0.7}>
            <Text style={ipStyles.paceValue}>{formatPace(targetPace, paceUnit)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onChange(undefined)} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ── Workout options (target distance + category) ────────────────────

function WorkoutOptions({
  open,
  onToggle,
  targetDistance,
  onChangeTargetDistance,
  inferredCategory,
  category,
  onChangeCategory,
  paceUnit,
}: {
  open: boolean;
  onToggle: () => void;
  targetDistance: number;
  onChangeTargetDistance: (m: number) => void;
  inferredCategory: WorkoutCategory;
  category: WorkoutCategory | undefined;
  onChangeCategory: (c: WorkoutCategory | undefined) => void;
  paceUnit: PaceUnit;
}) {
  const effective = category ?? inferredCategory;
  const catLabel = CATEGORY_OPTIONS.find((o) => o.value === effective)?.label ?? effective;
  const isAuto = category == null || category === inferredCategory;
  const distLabel = targetDistance > 0
    ? `Target ${formatDistanceShort(targetDistance, paceUnit)}`
    : 'No target distance';

  return (
    <View style={optStyles.container}>
      <TouchableOpacity style={optStyles.header} onPress={onToggle} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={optStyles.title}>Workout options</Text>
          <Text style={optStyles.summary} numberOfLines={1}>
            Category: {catLabel}{isAuto ? ' (auto)' : ''} · {distLabel}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-forward'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={optStyles.body}>
          <Text style={segStyles.sectionLabel}>TARGET DISTANCE</Text>
          <Text style={styles.targetDistHint}>
            Optional — workout auto-finishes when this GPS distance is reached
          </Text>
          <TargetDistancePicker meters={targetDistance} onChange={onChangeTargetDistance} paceUnit={paceUnit} />
          <CategorySuggestion
            inferred={inferredCategory}
            value={category}
            onChange={onChangeCategory}
          />
        </View>
      )}
    </View>
  );
}

// ── Category suggestion (inferred, overridable) ─────────────────────

const CATEGORY_OPTIONS: { value: WorkoutCategory; label: string; icon: string; color: string }[] = [
  { value: 'easy', label: 'Easy', icon: 'leaf-outline', color: Colors.easy },
  { value: 'tempo', label: 'Tempo', icon: 'speedometer-outline', color: Colors.warning },
  { value: 'intervals', label: 'Intervals', icon: 'repeat-outline', color: Colors.danger },
  { value: 'long_run', label: 'Long Run', icon: 'trail-sign-outline', color: Colors.accent },
  { value: 'race', label: 'Race', icon: 'trophy-outline', color: Colors.primary },
];

function CategorySuggestion({
  inferred,
  value,
  onChange,
}: {
  inferred: WorkoutCategory;
  value: WorkoutCategory | undefined;
  onChange: (c: WorkoutCategory | undefined) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const effective = value ?? inferred;
  const opt = CATEGORY_OPTIONS.find((o) => o.value === effective) ?? CATEGORY_OPTIONS[0];
  const isOverridden = value != null && value !== inferred;

  return (
    <View style={catStyles.container}>
      <View style={catStyles.headerRow}>
        <Text style={catStyles.headerLabel}>CATEGORY</Text>
        <TouchableOpacity
          style={[catStyles.suggestedChip, { borderColor: opt.color + '44', backgroundColor: opt.color + '14' }]}
          onPress={() => { hapticTap(); setExpanded(!expanded); }}
          activeOpacity={0.7}
        >
          <Ionicons name={opt.icon as any} size={13} color={opt.color} />
          <Text style={[catStyles.suggestedText, { color: opt.color }]}>{opt.label}</Text>
          {!isOverridden && <Text style={catStyles.suggestedHint}>Auto</Text>}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      {expanded && (
        <View style={catStyles.optionRow}>
          {CATEGORY_OPTIONS.map((o) => {
            const isActive = effective === o.value;
            return (
              <TouchableOpacity
                key={o.value}
                style={[catStyles.chip, isActive && { borderColor: o.color, backgroundColor: o.color + '22' }]}
                onPress={() => {
                  hapticTap();
                  onChange(o.value === inferred ? undefined : o.value);
                  setExpanded(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name={o.icon as any} size={14} color={isActive ? o.color : Colors.textMuted} />
                <Text style={[catStyles.chipText, isActive && { color: o.color }]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Target distance picker ───────────────────────────────────────────

const DISTANCE_PRESETS: { label: string; meters: number }[] = [
  { label: '5K', meters: 5000 },
  { label: '10K', meters: 10000 },
  { label: 'Half', meters: 21097 },
  { label: 'Marathon', meters: 42195 },
];

function TargetDistancePicker({ meters, onChange, paceUnit }: { meters: number; onChange: (m: number) => void; paceUnit: PaceUnit }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const divisor = paceUnit === 'minPerMile' ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel = paceUnit === 'minPerMile' ? 'mi' : 'km';

  const startEdit = () => { setEditValue(meters > 0 ? (meters / divisor).toFixed(1) : ''); setEditing(true); };
  const confirmEdit = () => {
    const val = parseFloat(editValue);
    onChange(isNaN(val) || val <= 0 ? 0 : Math.round(val * divisor));
    setEditing(false);
  };

  return (
    <View style={tdStyles.container}>
      <View style={tdStyles.presetRow}>
        {DISTANCE_PRESETS.map(p => {
          const isActive = Math.abs(meters - p.meters) < 100;
          return (
            <TouchableOpacity key={p.label} style={[tdStyles.chip, isActive && tdStyles.chipActive]} onPress={() => { hapticTap(); onChange(isActive ? 0 : p.meters); }} activeOpacity={0.7}>
              <Text style={[tdStyles.chipText, isActive && tdStyles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[tdStyles.chip, meters > 0 && !DISTANCE_PRESETS.some(p => Math.abs(meters - p.meters) < 100) && tdStyles.chipActive]}
          onPress={startEdit} activeOpacity={0.7}
        >
          <Text style={[tdStyles.chipText, meters > 0 && !DISTANCE_PRESETS.some(p => Math.abs(meters - p.meters) < 100) && tdStyles.chipTextActive]}>Custom</Text>
        </TouchableOpacity>
      </View>
      {editing && (
        <View style={tdStyles.editRow}>
          <TextInput style={tdStyles.editInput} value={editValue} onChangeText={setEditValue} keyboardType="decimal-pad" maxLength={6} autoFocus placeholder="0.0" placeholderTextColor={Colors.textMuted} />
          <Text style={tdStyles.editUnit}>{unitLabel}</Text>
          <TouchableOpacity onPress={confirmEdit} style={tdStyles.doneBtn}><Ionicons name="checkmark" size={18} color={Colors.primary} /></TouchableOpacity>
        </View>
      )}
      {meters > 0 && !editing && (
        <View style={tdStyles.valueRow}>
          <Text style={tdStyles.valueText}>{formatDistanceShort(meters, paceUnit)}</Text>
          <TouchableOpacity onPress={() => { hapticTap(); onChange(0); }} hitSlop={8}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Duration picker ──────────────────────────────────────────────────

function DurationPicker({ seconds, onChange, color }: { seconds: number; onChange: (s: number) => void; color: string }) {
  const [editing, setEditing] = useState(false);
  const [editMins, setEditMins] = useState('');
  const [editSecs, setEditSecs] = useState('');
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const startEdit = () => { setEditMins(mins.toString()); setEditSecs(secs.toString().padStart(2, '0')); setEditing(true); };
  const confirmEdit = () => {
    const m = parseInt(editMins, 10) || 0;
    const s = parseInt(editSecs, 10) || 0;
    onChange(Math.max(5, m * 60 + Math.min(59, s)));
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={dpStyles.editContainer}>
        <TextInput style={dpStyles.editInput} value={editMins} onChangeText={setEditMins} keyboardType="number-pad" maxLength={2} selectTextOnFocus autoFocus placeholder="M" placeholderTextColor={Colors.textMuted} />
        <Text style={dpStyles.editColon}>:</Text>
        <TextInput style={dpStyles.editInput} value={editSecs} onChangeText={setEditSecs} keyboardType="number-pad" maxLength={2} selectTextOnFocus placeholder="SS" placeholderTextColor={Colors.textMuted} />
        <TouchableOpacity onPress={confirmEdit} style={dpStyles.doneBtn}><Ionicons name="checkmark" size={18} color={Colors.primary} /></TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={startEdit} activeOpacity={0.7} style={dpStyles.tapToEdit}>
      <Text style={[dpStyles.value, { color }]}>{mins}:{secs.toString().padStart(2, '0')}</Text>
      <View style={dpStyles.editIconCircle}><Ionicons name="pencil" size={14} color={Colors.textSecondary} /></View>
    </TouchableOpacity>
  );
}

// ── Distance picker ──────────────────────────────────────────────────

function DistancePicker({ meters, onChange, color, paceUnit }: { meters: number; onChange: (m: number) => void; color: string; paceUnit: PaceUnit }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const divisor = paceUnit === 'minPerMile' ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel = paceUnit === 'minPerMile' ? 'mi' : 'km';

  const startEdit = () => { setEditValue(meters > 0 ? (meters / divisor).toFixed(2) : ''); setEditing(true); };
  const confirmEdit = () => {
    const val = parseFloat(editValue);
    onChange(isNaN(val) || val <= 0 ? 400 : Math.round(val * divisor));
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={dpStyles.editContainer}>
        <TextInput style={[dpStyles.editInput, { width: 72 }]} value={editValue} onChangeText={setEditValue} keyboardType="decimal-pad" maxLength={5} selectTextOnFocus autoFocus placeholder="0.0" placeholderTextColor={Colors.textMuted} />
        <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' }}>{unitLabel}</Text>
        <TouchableOpacity onPress={confirmEdit} style={dpStyles.doneBtn}><Ionicons name="checkmark" size={18} color={Colors.primary} /></TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={startEdit} activeOpacity={0.7} style={dpStyles.tapToEdit}>
      <Text style={[dpStyles.value, { color }]}>{formatDistanceShort(meters, paceUnit)}</Text>
      <View style={dpStyles.editIconCircle}><Ionicons name="pencil" size={14} color={Colors.textSecondary} /></View>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const segStyles = StyleSheet.create({
  container: {},
  sectionLabel: { fontSize: FontSize.xs - 1, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 2 },
  sectionHint: { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginBottom: Spacing.xs },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: Spacing.sm },
  typeChip: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: Colors.surfaceLight, backgroundColor: Colors.surfaceLight },
  typeChipText: { fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 0.5, color: Colors.textMuted },
  intensityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.sm },
  intensityChip: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: Colors.surfaceLight, backgroundColor: Colors.surfaceLight },
  intensityText: { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textMuted },
  effortNumberRow: { flexDirection: 'row', gap: 3, marginTop: Spacing.sm },
  effortNumBtn: { flex: 1, aspectRatio: 1, maxWidth: 32, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: Colors.surfaceLight, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  effortNumText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  labelInput: { flex: 1, backgroundColor: Colors.surfaceLight, color: Colors.textPrimary, fontSize: FontSize.sm, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.sm },
  addLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.xs, paddingVertical: 2 },
  addLabelText: { fontSize: FontSize.xs - 1, color: Colors.textMuted, fontWeight: '600' },
  paceSwitchBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.accent + '55', backgroundColor: Colors.accent + '14' },
  paceSwitchText: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: Colors.accent },
  intensityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md },
  rpeHint: { fontSize: FontSize.xs - 1, color: Colors.textMuted, fontWeight: '600' },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.md, paddingVertical: 2, alignSelf: 'flex-start' },
  moreToggleText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '700' },
  moreBox: { marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.background },
});

const sumStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  pressArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2, minHeight: 40 },
  pressColumn: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  smallDot: { width: 6, height: 6, borderRadius: 3 },
  textCol: { flex: 1 },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  detail: { fontSize: FontSize.xs, color: Colors.textSecondary, fontVariant: ['tabular-nums'], marginTop: 1 },
  innerLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginLeft: Spacing.lg, marginTop: Spacing.xs },
  innerText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  pickerBox: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
});

const targetStyles = StyleSheet.create({
  container: { marginTop: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  manualPill: { flex: 1, backgroundColor: Colors.surfaceLight, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md },
  manualHint: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm + 2, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.primary + '55', backgroundColor: Colors.primary + '14' },
  typePillText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  menu: { marginTop: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.background, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  menuItemActive: { backgroundColor: Colors.primary + '12' },
  menuLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  menuDesc: { fontSize: FontSize.xs - 1, color: Colors.textMuted },
});

const optStyles = StyleSheet.create({
  container: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  summary: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1 },
  body: { marginTop: Spacing.md },
});

const rgStyles = StyleSheet.create({
  container: {},
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  innerBlock: { marginLeft: Spacing.sm, borderLeftWidth: 2, borderLeftColor: Colors.primary + '30', paddingLeft: Spacing.sm, paddingVertical: Spacing.xs, backgroundColor: Colors.surface },
  innerBody: { marginTop: Spacing.sm },
  nestedRepeat: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },
});


const ipStyles = StyleSheet.create({
  paceEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  paceInput: { backgroundColor: Colors.surfaceLight, color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'], width: 36, height: 36, borderRadius: BorderRadius.sm, textAlign: 'center', padding: 0, borderWidth: 1, borderColor: Colors.accent },
  paceColon: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '700' },
  paceUnit: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  paceDoneBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '22', justifyContent: 'center', alignItems: 'center', marginLeft: 2 },
  paceDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  paceValue: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.accent, fontVariant: ['tabular-nums'] },
});

const catStyles = StyleSheet.create({
  container: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { fontSize: FontSize.xs - 1, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2 },
  suggestedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1 },
  suggestedText: { fontSize: FontSize.xs, fontWeight: '700' },
  suggestedHint: { fontSize: FontSize.xs - 2, fontWeight: '600', color: Colors.textMuted, marginLeft: 2 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing.xs + 1, paddingHorizontal: Spacing.sm + 2, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.surfaceLight, backgroundColor: Colors.surfaceLight },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
});

const tdStyles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.surfaceLight, backgroundColor: Colors.surfaceLight },
  chipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  chipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  editInput: { backgroundColor: Colors.surfaceLight, color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'], width: 72, height: 36, borderRadius: BorderRadius.sm, textAlign: 'center', padding: 0, borderWidth: 1, borderColor: Colors.accent },
  editUnit: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  doneBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '22', justifyContent: 'center', alignItems: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  valueText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.accent, fontVariant: ['tabular-nums'] },
});

const dpStyles = StyleSheet.create({
  tapToEdit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceLight, paddingVertical: Spacing.xs + 2, paddingLeft: Spacing.md, paddingRight: Spacing.sm, borderRadius: BorderRadius.md },
  value: { fontSize: FontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'center' },
  editIconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  editContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editInput: { backgroundColor: Colors.surfaceLight, color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'], width: 36, height: 36, borderRadius: BorderRadius.sm, textAlign: 'center', padding: 0, borderWidth: 1, borderColor: Colors.accent },
  editColon: { color: Colors.textSecondary, fontSize: FontSize.lg, fontWeight: '700' },
  doneBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '22', justifyContent: 'center', alignItems: 'center', marginLeft: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  autoSaveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.surfaceLight, backgroundColor: Colors.background },
  autoSaveStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  autoSaveText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  autoSaveTextIdle: { fontSize: FontSize.xs, color: Colors.textMuted },
  saveAsNewHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.surface, paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.sm + 2, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.accent + '40' },
  saveAsNewHeaderText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.accent },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  revertHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.surface, paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.sm + 2, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.surfaceLight },
  revertHeaderText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  planWorkoutHeader: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.accent + '20', backgroundColor: Colors.accent + '08' },
  planWorkoutBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 4 },
  planWorkoutBadgeText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  planWorkoutHint: { fontSize: FontSize.xs, color: Colors.textMuted },
  editHintBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, backgroundColor: Colors.accent + '12', borderBottomWidth: 1, borderBottomColor: Colors.accent + '20' },
  editHintContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginRight: Spacing.sm },
  editHintText: { fontSize: FontSize.xs, color: Colors.textSecondary, flex: 1 },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600', marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: Colors.surface, color: Colors.textPrimary, fontSize: FontSize.lg, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.surfaceLight },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  reorderHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reorderHintText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  blockCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: 'transparent' },
  blockCardOpen: { borderColor: Colors.surfaceLight },
  blockBody: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceLight },
  blockToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceLight },
  blockToolbarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbarBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  addRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, padding: Spacing.sm },
  addBtnText: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '600' },
  repeatRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  repeatCount: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.primary, minWidth: 36, textAlign: 'center' },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { color: Colors.textPrimary, fontSize: 18, fontWeight: '600', lineHeight: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.md },
  totalLabel: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '600' },
  totalValue: { fontSize: FontSize.xl, color: Colors.primary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { marginTop: Spacing.xl, gap: Spacing.md },
  saveBtn: { flexDirection: 'row', backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  saveBtnText: { color: Colors.black, fontSize: FontSize.lg, fontWeight: '800' },
  saveAsNewBtn: { flexDirection: 'row', backgroundColor: Colors.surfaceLight, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1.5, borderColor: Colors.accent },
  saveAsNewBtnText: { color: Colors.accent, fontSize: FontSize.lg, fontWeight: '700' },
  cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  cancelBtnText: { color: Colors.textMuted, fontSize: FontSize.md, fontWeight: '600' },
  targetDistHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.sm },
  toggleGroupBox: { marginTop: Spacing.sm, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.sm },
  toggleGroupLabel: { fontSize: FontSize.xs - 1, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: Spacing.xs },
});
