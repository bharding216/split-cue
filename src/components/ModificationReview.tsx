/**
 * ModificationReview — Before/after comparison of AI-proposed plan changes.
 *
 * Shows what the AI wants to change, lets the runner approve (Apply)
 * or keep the original plan. After applying, an Undo button appears
 * for a short window.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import type { PlanModification } from '../ai/planService';
import {
  formatDurationForSpeech,
  type WorkoutBlock,
  type Segment,
  type RepeatGroup,
  defaultSegmentLabel,
} from '../workout/workoutTypes';
import { migrateToBlockModel } from '../workout/workoutStorage';
import { useUnits } from '../hooks/useUnits';
import { formatPace, formatSegmentDistance } from '../units/format';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Types ──────────────────────────────────────────────────

export interface ModificationItem {
  modification: PlanModification;
  /** The existing day_label/description for before comparison. */
  before?: { day_label?: string; description?: string } | null;
}

interface Props {
  items: ModificationItem[];
  coachMessage?: string;
  onApply: (modifications: PlanModification[]) => Promise<void>;
  onKeepOriginal: () => void;
  onUndo?: () => Promise<void>;
}

const UNDO_WINDOW_MS = 15_000;

// ── Component ──────────────────────────────────────────────

export function ModificationReview({ items, coachMessage, onApply, onKeepOriginal, onUndo }: Props) {
  const unit = useUnits();
  const [status, setStatus] = useState<'reviewing' | 'applying' | 'applied' | 'undoing'>('reviewing');
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [selectedCards, setSelectedCards] = useState<Set<number>>(
    () => new Set(items.map((_, i) => i)),
  );
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoProgress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const toggleSelected = useCallback((index: number) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectedCount = selectedCards.size;

  const handleApply = useCallback(async () => {
    if (selectedCount === 0) return;
    setStatus('applying');
    try {
      const selected = items
        .filter((_, i) => selectedCards.has(i))
        .map((i) => i.modification);
      await onApply(selected);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStatus('applied');
      if (onUndo) {
        setShowUndo(true);
        undoProgress.setValue(1);
        Animated.timing(undoProgress, {
          toValue: 0,
          duration: UNDO_WINDOW_MS,
          useNativeDriver: false,
        }).start();
        undoTimerRef.current = setTimeout(() => {
          setShowUndo(false);
        }, UNDO_WINDOW_MS);
      }
    } catch {
      setStatus('reviewing');
    }
  }, [items, selectedCards, selectedCount, onApply, onUndo, undoProgress]);

  const handleUndo = useCallback(async () => {
    if (!onUndo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setStatus('undoing');
    try {
      await onUndo();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowUndo(false);
      setStatus('reviewing');
    } catch {
      setStatus('applied');
    }
  }, [onUndo]);

  if (items.length === 0) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const toggleCard = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const formatSegment = (seg: Segment): string => {
    const label = seg.label || defaultSegmentLabel(seg.segmentType);
    let duration: string;
    if (seg.target.type === 'distance' && seg.target.distanceMeters) {
      duration = formatSegmentDistance(seg.target.distanceMeters, unit);
    } else if (seg.target.type === 'time' && seg.target.durationSeconds) {
      duration = formatDurationForSpeech(seg.target.durationSeconds);
    } else {
      duration = 'open-ended';
    }
    const parts = [`${duration} ${label}`];
    if (seg.intensity) parts.push(seg.intensity);
    if (seg.targetPace) parts.push(`@ ${formatPace(seg.targetPace, unit)}`);
    return parts.join('  ·  ');
  };

  type DetailBlock = {
    name?: string;
    repeats: number;
    intervals: string[];
  };

  const formatBlocks = (rawData: any): DetailBlock[] => {
    // rawData may be old-format workout or new-format blocks array
    let blocks: WorkoutBlock[] = [];

    if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
      // Entire workout object — migrate
      const migrated = migrateToBlockModel(rawData as any);
      blocks = migrated.blocks;
    } else if (Array.isArray(rawData)) {
      // Could be old WorkoutRepeatBlock[] or new WorkoutBlock[]
      if (rawData.length > 0 && rawData[0].blockType) {
        blocks = rawData as WorkoutBlock[];
      } else if (rawData.length > 0 && rawData[0].intervals) {
        // Old format array — wrap in a fake workout and migrate
        const migrated = migrateToBlockModel({ warmup: [], blocks: rawData, cooldown: [], name: '', id: '', createdAt: 0, updatedAt: 0 });
        blocks = migrated.blocks;
      }
    }

    if (blocks.length === 0) return [];
    const result: DetailBlock[] = [];

    for (const block of blocks) {
      if (block.blockType === 'segment') {
        result.push({ repeats: 1, intervals: [formatSegment(block)] });
      } else {
        const rg = block;
        const segDescs = rg.blocks
          .filter((b): b is Segment => b.blockType === 'segment')
          .map(formatSegment);
        if (segDescs.length > 0) {
          result.push({ name: rg.name, repeats: rg.repetitions, intervals: segDescs });
        }
      }
    }

    return result;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="git-compare-outline" size={20} color={Colors.accent} />
        <Text style={styles.headerTitle}>Suggested Changes</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{items.length}</Text>
        </View>
      </View>

      {/* Coach message */}
      {coachMessage && (
        <View style={styles.coachBubble}>
          <Text style={styles.coachText}>{coachMessage}</Text>
        </View>
      )}

      {/* Change cards */}
      {items.map((item, index) => {
        const isExpanded = expandedCards.has(index);
        const isSelected = selectedCards.has(index);
        const hasDetails =
          item.modification.action !== 'skip' &&
          (item.modification.description || item.modification.workout || item.before?.description);

        const renderBlockGroup = (label: string, blocks: any, prefix: string) => {
          const parsed = formatBlocks(blocks);
          if (parsed.length === 0) return null;
          return (
            <View style={styles.detailGroup}>
              <Text style={styles.detailGroupLabel}>{label}</Text>
              {parsed.map((block, bi) => (
                <View key={`${prefix}-${bi}`} style={block.repeats > 1 ? styles.repeatBlock : undefined}>
                  {block.name && (
                    <Text style={styles.detailBlockHeader}>{block.name}</Text>
                  )}
                  {block.repeats > 1 && (
                    <View style={styles.repeatBadge}>
                      <Ionicons name="repeat" size={10} color={Colors.accent} />
                      <Text style={styles.repeatBadgeText}>Repeat ×{block.repeats}</Text>
                    </View>
                  )}
                  {block.intervals.map((line, li) => (
                    <Text key={`${prefix}-${bi}-${li}`} style={styles.detailLine}>
                      {line}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          );
        };

        return (
          <View
            key={`${item.modification.date}-${index}`}
            style={[
              styles.changeCard,
              status === 'reviewing' && !isSelected && styles.changeCardDeselected,
              status === 'reviewing' && isSelected && styles.changeCardSelected,
            ]}
          >
            {/* Top row: date + chevron */}
            <View style={styles.changeDateRow}>
              <Text style={[styles.changeDate, { flex: 1 }]}>{formatDate(item.modification.date)}</Text>
              {hasDetails && (
                <TouchableOpacity
                  onPress={() => toggleCard(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={() => hasDetails && toggleCard(index)}
              activeOpacity={hasDetails ? 0.7 : 1}
            >
              {item.modification.action === 'skip' ? (
                <View style={styles.skipRow}>
                  <Ionicons name="close-circle" size={16} color={Colors.danger} />
                  <Text style={styles.skipText}>Skip this workout</Text>
                </View>
              ) : (
                <View style={styles.comparison}>
                  {/* Before */}
                  {item.before && (
                    <View style={styles.beforeSection}>
                      <Text style={styles.sectionLabel}>Before</Text>
                      <Text style={styles.beforeLabel}>{item.before.day_label || 'Workout'}</Text>
                      {item.before.description && (
                        <Text style={styles.beforeDesc} numberOfLines={isExpanded ? undefined : 2}>
                          {item.before.description}
                        </Text>
                      )}
                    </View>
                  )}

                  {item.before && <Ionicons name="arrow-down" size={16} color={Colors.textMuted} style={styles.arrow} />}

                  {/* After */}
                  <View style={styles.afterSection}>
                    <Text style={styles.sectionLabel}>After</Text>
                    <Text style={styles.afterLabel}>
                      {item.modification.day_label || 'Updated Workout'}
                    </Text>
                    {item.modification.description && (
                      <Text style={styles.afterDesc} numberOfLines={isExpanded ? undefined : 2}>
                        {item.modification.description}
                      </Text>
                    )}
                  </View>

                  {/* Expanded workout details */}
                  {isExpanded && item.modification.workout && (
                    <View style={styles.workoutDetails}>
                      {renderBlockGroup('Workout', item.modification.workout, `bl-${index}`)}
                    </View>
                  )}
                </View>
              )}

              {!isExpanded && hasDetails && (
                <Text style={styles.tapHint}>Tap for details</Text>
              )}
            </TouchableOpacity>

            {/* Include / Exclude toggle */}
            {status === 'reviewing' && items.length > 1 && (
              <TouchableOpacity
                style={[styles.toggleBar, isSelected ? styles.toggleBarIncluded : styles.toggleBarExcluded]}
                onPress={() => toggleSelected(index)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'close-circle-outline'}
                  size={16}
                  color={isSelected ? Colors.primary : Colors.textMuted}
                />
                <Text style={[styles.toggleBarText, isSelected ? styles.toggleBarTextIncluded : styles.toggleBarTextExcluded]}>
                  {isSelected ? 'Included' : 'Excluded — tap to include'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Action buttons */}
      {status === 'reviewing' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.applyBtn, selectedCount === 0 && styles.applyBtnDisabled]}
            onPress={handleApply}
            activeOpacity={0.8}
            disabled={selectedCount === 0}
          >
            <Ionicons name="checkmark-circle" size={18} color={Colors.black} />
            <Text style={styles.applyBtnText}>
              {selectedCount === items.length
                ? 'Apply All Changes'
                : selectedCount > 0
                  ? `Apply ${selectedCount} of ${items.length}`
                  : 'Select Changes to Apply'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keepBtn} onPress={onKeepOriginal} activeOpacity={0.7}>
            <Text style={styles.keepBtnText}>Keep Original</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'applying' && (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>Applying changes…</Text>
        </View>
      )}

      {status === 'applied' && (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
          <Text style={[styles.statusText, { color: Colors.primary }]}>Changes applied</Text>
        </View>
      )}

      {/* Undo bar */}
      {showUndo && onUndo && (
        <View style={styles.undoBar}>
          <Animated.View
            style={[
              styles.undoProgress,
              {
                width: undoProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
          <TouchableOpacity style={styles.undoBtn} onPress={handleUndo} activeOpacity={0.8}>
            <Ionicons name="arrow-undo" size={16} color={Colors.white} />
            <Text style={styles.undoBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  badge: {
    backgroundColor: Colors.accent + '30',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.accent,
  },
  coachBubble: {
    backgroundColor: Colors.accent + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  coachText: {
    fontSize: FontSize.sm,
    color: Colors.accent,
    lineHeight: 20,
  },
  changeCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  changeCardSelected: {
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  changeCardDeselected: {
    opacity: 0.5,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
  },
  toggleBarIncluded: {
    backgroundColor: Colors.primary + '15',
  },
  toggleBarExcluded: {
    backgroundColor: Colors.surfaceLight,
  },
  toggleBarText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  toggleBarTextIncluded: {
    color: Colors.primary,
  },
  toggleBarTextExcluded: {
    color: Colors.textMuted,
  },
  changeDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  changeDate: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  skipText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
  },
  comparison: {},
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  beforeSection: {
    opacity: 0.6,
  },
  beforeLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  beforeDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    textDecorationLine: 'line-through',
  },
  arrow: {
    alignSelf: 'center',
    marginVertical: 4,
  },
  afterSection: {},
  afterLabel: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
  },
  afterDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  workoutDetails: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceLight,
    gap: Spacing.sm,
  },
  detailGroup: {
    gap: 2,
  },
  detailGroupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  repeatBlock: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent + '50',
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  repeatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.accent,
  },
  detailBlockHeader: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 18,
    marginBottom: 2,
  },
  detailLine: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    paddingLeft: Spacing.sm,
  },
  tapHint: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    gap: Spacing.xs,
  },
  applyBtnDisabled: {
    opacity: 0.4,
  },
  applyBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.black,
  },
  keepBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  keepBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  undoBar: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  undoProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: Colors.accent + '20',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: Spacing.xs,
  },
  undoBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.white,
  },
});
