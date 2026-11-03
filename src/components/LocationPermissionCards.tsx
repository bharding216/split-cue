/**
 * In-context location permission cards: foreground access on the pre-run
 * screen, and background access on both the pre-run and finish screens.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import {
  shouldOfferBackgroundLocation,
  requestBackgroundLocationAccess,
  dismissBackgroundLocationOffer,
  type BackgroundOfferPlacement,
  type LocationAccess,
} from '../pace/locationPermission';

export function PreRunLocationCard({
  access,
  onAllow,
}: {
  access: LocationAccess;
  onAllow: () => void;
}) {
  if (access === 'granted') return null;

  const blocked = access === 'blocked';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="navigate" size={18} color={Colors.primary} />
        <Text style={styles.title}>
          {blocked ? 'Location is turned off' : 'Allow location for live pace'}
        </Text>
      </View>
      <Text style={styles.body}>
        {blocked
          ? "Pace and distance won't be recorded. Turn on location for SplitCue in Settings, or switch GPS off in Run Settings."
          : 'SplitCue uses GPS during your run to track pace and distance.'}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            hapticTap();
            if (blocked) Linking.openSettings();
            else onAllow();
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>{blocked ? 'Open Settings' : 'Allow'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function BackgroundLocationCard({ placement }: { placement: BackgroundOfferPlacement }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    shouldOfferBackgroundLocation(placement)
      .then((offer) => {
        if (!cancelled) setVisible(offer);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [placement]);

  if (!visible) return null;

  return (
    <View style={[styles.card, placement === 'finished' && styles.finishedCard]}>
      <View style={styles.header}>
        <Ionicons name="lock-closed" size={18} color={Colors.primary} />
        <Text style={styles.title}>Keep tracking with your screen locked</Text>
      </View>
      <Text style={styles.body}>
        {placement === 'preRun'
          ? 'Most runs happen with the phone locked or in a pocket. Allow background location so pace cues and distance keep working.'
          : 'Allow background location so pace and distance keep recording when your phone is locked or in your pocket.'}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => {
            hapticTap();
            setVisible(false);
            dismissBackgroundLocationOffer(placement);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryBtnText}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            hapticTap();
            setVisible(false);
            requestBackgroundLocationAccess(placement).catch(() => {});
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Allow</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  finishedCard: {
    alignSelf: 'stretch',
    marginTop: Spacing.md,
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
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  primaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.black,
  },
  secondaryBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  secondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
});
