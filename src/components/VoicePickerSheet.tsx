/**
 * Bottom-sheet voice picker with quality filter.
 *
 * Opens as a modal overlay that slides up from the bottom.
 * Voices are rendered in a FlatList (virtualised) so even 50+ items stay smooth.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { useLargeText } from '../hooks/useLargeText';

const ANIM_MS = 280;

/** Strip noisy Android prefixes so voice names are human-readable. */
function formatVoiceName(voice: Speech.Voice): string {
  let name = voice.name;
  if (name.startsWith('en-') && name.includes('#')) {
    name = name.split('#').pop() ?? name;
  }
  const quality =
    voice.quality === Speech.VoiceQuality.Enhanced ? ' (Enhanced)' : '';
  if (name.includes('Enhanced') || name.includes('Premium')) return name;
  return `${name}${quality}`;
}

interface PremiumOption {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

interface Props {
  visible: boolean;
  voices: Speech.Voice[];
  /** Selected device voice; null is System Default, undefined means no device voice is selected. */
  selectedId: string | null | undefined;
  /** AI voice shown above the device voices. */
  premiumOption?: PremiumOption;
  onSelect: (id: string | null) => void;
  onPreview: (id: string | null) => void;
  onClose: () => void;
}

export default function VoicePickerSheet({
  visible,
  voices,
  selectedId,
  premiumOption,
  onSelect,
  onPreview,
  onClose,
}: Props) {
  const [enhancedOnly, setEnhancedOnly] = useState(false);
  const large = useLargeText();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = windowHeight * (large ? 0.92 : 0.72);

  // Slide animation
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);

  const animatedSheet = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBackdrop = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const open = useCallback(() => {
    translateY.value = withTiming(0, {
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
    backdropOpacity.value = withTiming(1, { duration: ANIM_MS });
  }, [translateY, backdropOpacity]);

  const close = useCallback(() => {
    translateY.value = withTiming(sheetHeight, {
      duration: ANIM_MS,
      easing: Easing.in(Easing.cubic),
    });
    backdropOpacity.value = withTiming(0, { duration: ANIM_MS });
    setTimeout(() => {
      setEnhancedOnly(false);
      onClose();
    }, ANIM_MS);
  }, [translateY, backdropOpacity, onClose, sheetHeight]);

  const isHighQuality = useCallback((v: Speech.Voice) => {
    if (v.quality === Speech.VoiceQuality.Enhanced) return true;
    const n = v.name.toLowerCase();
    return n.includes('premium') || n.includes('enhanced');
  }, []);

  // Filter & sort voices — Enhanced/Premium always at the top
  const filtered = useMemo(() => {
    let list = voices;
    if (enhancedOnly) {
      list = list.filter(isHighQuality);
    }
    return [...list].sort((a, b) => {
      const qA = isHighQuality(a) ? 0 : 1;
      const qB = isHighQuality(b) ? 0 : 1;
      if (qA !== qB) return qA - qB;
      return a.name.localeCompare(b.name);
    });
  }, [voices, enhancedOnly, isHighQuality]);

  const hasEnhanced = useMemo(
    () => voices.some(isHighQuality),
    [voices, isHighQuality],
  );

  const handleSelect = useCallback(
    (id: string | null) => {
      hapticTap();
      onSelect(id);
      onPreview(id);
    },
    [onSelect, onPreview],
  );

  const renderVoice = useCallback(
    ({ item }: { item: Speech.Voice }) => {
      const active = selectedId === item.identifier;
      return (
        <TouchableOpacity
          style={[styles.voiceRow, active && styles.voiceRowActive]}
          onPress={() => handleSelect(item.identifier)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
        >
          <View style={styles.voiceInfo}>
            <Text style={[styles.voiceName, active && styles.voiceNameActive]}>
              {formatVoiceName(item)}
            </Text>
            <Text style={styles.voiceSub}>{item.language}</Text>
          </View>
          {isHighQuality(item) && (
            <View style={styles.enhancedBadge}>
              <Text style={styles.enhancedBadgeText}>
                {item.name.toLowerCase().includes('premium') ? 'Premium' : 'Enhanced'}
              </Text>
            </View>
          )}
          {active && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} style={styles.checkmark} />}
        </TouchableOpacity>
      );
    },
    [selectedId, handleSelect, isHighQuality],
  );

  const keyExtractor = useCallback((v: Speech.Voice) => v.identifier, []);

  const ListHeader = useMemo(
    () => (
      <>
      {premiumOption && (
        <TouchableOpacity
          style={[styles.voiceRow, premiumOption.selected && styles.voiceRowActive]}
          onPress={() => {
            hapticTap();
            premiumOption.onSelect();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: premiumOption.selected }}
        >
          <View style={styles.voiceInfo}>
            <Text style={[styles.voiceName, premiumOption.selected && styles.voiceNameActive]}>
              {premiumOption.label}
            </Text>
            <Text style={styles.voiceSub}>Natural AI voice · Works offline during runs</Text>
          </View>
          <View style={styles.enhancedBadge}>
            <Text style={styles.enhancedBadgeText}>AI</Text>
          </View>
          {premiumOption.selected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} style={styles.checkmark} />}
        </TouchableOpacity>
      )}
      {premiumOption && <Text style={styles.groupLabel}>Device voices</Text>}
      <TouchableOpacity
        style={[styles.voiceRow, selectedId === null && styles.voiceRowActive]}
        onPress={() => handleSelect(null)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: selectedId === null }}
      >
        <View style={styles.voiceInfo}>
          <Text
            style={[
              styles.voiceName,
              selectedId === null && styles.voiceNameActive,
            ]}
          >
            System Default
          </Text>
          <Text style={styles.voiceSub}>
            Uses your device's default voice
          </Text>
        </View>
        {selectedId === null && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} style={styles.checkmark} />}
      </TouchableOpacity>
      </>
    ),
    [selectedId, handleSelect, premiumOption],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={open}
      onRequestClose={close}
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={close}>
          <Animated.View style={[styles.backdrop, animatedBackdrop]} />
        </TouchableWithoutFeedback>

        {/* Sheet */}
        <Animated.View style={[styles.sheet, { height: sheetHeight }, animatedSheet]}>
          {/* Handle */}
          <View style={styles.handleBar}>
            <View style={styles.handle} />
          </View>

          {/* Title row */}
          <View style={styles.titleRow}>
            <Text style={styles.title} maxFontSizeMultiplier={MaxFontScale.display}>
              Choose a Voice
            </Text>
            <TouchableOpacity
              onPress={close}
              activeOpacity={0.7}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.doneBtn}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Enhanced filter chip (only show if enhanced voices exist) */}
          {hasEnhanced && (
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  enhancedOnly && styles.filterChipActive,
                ]}
                onPress={() => {
                  hapticTap();
                  setEnhancedOnly((prev) => !prev);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Enhanced voices only"
                accessibilityState={{ selected: enhancedOnly }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    enhancedOnly && styles.filterChipTextActive,
                  ]}
                >
                  <Ionicons
                    name="sparkles"
                    size={14}
                    color={enhancedOnly ? Colors.primary : Colors.textSecondary}
                  />{' '}
                  Enhanced
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Voice count */}
          <Text style={styles.countLabel}>
            {filtered.length} voice{filtered.length !== 1 ? 's' : ''}
            {enhancedOnly ? ' (enhanced only)' : ''}
          </Text>

          {/* Voice list */}
          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            renderItem={renderVoice}
            ListHeaderComponent={!enhancedOnly ? ListHeader : null}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No enhanced voices found.
              </Text>
            }
          />
        </Animated.View>
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceLight,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    flexShrink: 1,
    marginRight: Spacing.md,
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  groupLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  doneBtn: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  filterRow: {
    paddingHorizontal: Spacing.lg,
  },
  filterChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm + 2,
    minHeight: 36,
    paddingVertical: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  filterChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  countLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  voiceRowActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  voiceNameActive: {
    color: Colors.primary,
  },
  voiceSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  enhancedBadge: {
    backgroundColor: Colors.primary + '22',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  enhancedBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  checkmark: {
    marginLeft: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
