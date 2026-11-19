/**
 * Collapsible settings section — shows title + value summary when collapsed,
 * reveals full controls on tap. Uses LayoutAnimation for smooth transitions.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleSectionProps {
  /** Section title shown in the header. */
  title: string;
  /** Short summary of the current value — visible when collapsed. */
  summary?: string;
  /** Optional icon name from Ionicons. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Whether the section starts expanded. Defaults to false. */
  defaultExpanded?: boolean;
  /** Section contents. */
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  summary,
  icon,
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasToggled = useRef(false);

  const toggle = useCallback(() => {
    hapticTap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hasToggled.current = true;
    setExpanded((prev) => !prev);
  }, []);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
      >
        <View style={styles.headerLeft}>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={Colors.textSecondary}
              style={styles.headerIcon}
            />
          )}
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        <View style={styles.headerRight}>
          {!expanded && summary ? (
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textMuted}
          />
        </View>
      </TouchableOpacity>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerIcon: {
    marginRight: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
    marginLeft: Spacing.md,
  },
  summary: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
    maxWidth: 180,
  },
  body: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
});
