/**
 * Conditions a run was finished in: temperature, sky, feels-like, wind, and
 * humidity, in the runner's units. Carries the Apple Weather attribution
 * WeatherKit requires wherever its data is shown.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { RunWeather } from '../workout/workoutTypes';
import type { PaceUnit } from '../pace/paceTypes';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { useLargeText } from '../hooks/useLargeText';

interface Props {
  weather: RunWeather;
  paceUnit: PaceUnit;
}

const ATTRIBUTION_URL = 'https://weatherkit.apple.com/legal-attribution.html';
// The Apple logo glyph only renders on Apple platforms.
const ATTRIBUTION_LABEL = Platform.OS === 'ios' ? '\uF8FF Weather' : 'Apple Weather';

// ── Helpers ──────────────────────────────────────────────────────

function formatTemp(celsius: number, unit: PaceUnit): string {
  const value = unit === 'minPerMile' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

function formatWind(kph: number, unit: PaceUnit): string {
  return unit === 'minPerMile' ? `${Math.round(kph / 1.609344)} mph` : `${Math.round(kph)} km/h`;
}

/** "PartlyCloudy" → "Partly cloudy". */
function conditionLabel(code: string): string {
  const words = code.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function conditionIcon(code: string, daylight: boolean): keyof typeof Ionicons.glyphMap {
  if (/Thunder|Storm|Hurricane/.test(code)) return 'thunderstorm-outline';
  if (/Snow|Flurries|Sleet|Blizzard|Hail|WintryMix|Freezing/.test(code)) return 'snow-outline';
  if (/Rain|Drizzle|Showers/.test(code)) return 'rainy-outline';
  if (/Clear/.test(code)) return daylight ? 'sunny-outline' : 'moon-outline';
  if (/PartlyCloudy/.test(code)) return daylight ? 'partly-sunny-outline' : 'cloudy-night-outline';
  if (/Wind|Breezy/.test(code)) return 'flag-outline';
  if (/Hot/.test(code)) return 'sunny-outline';
  return 'cloudy-outline';
}

// ── Main component ──────────────────────────────────────────────

export function RunWeatherCard({ weather, paceUnit }: Props) {
  const large = useLargeText();
  const unitLetter = paceUnit === 'minPerMile' ? 'F' : 'C';
  const details = [
    { label: 'Feels Like', value: formatTemp(weather.feelsLikeC, paceUnit) },
    { label: 'Wind', value: formatWind(weather.windSpeedKph, paceUnit) },
    { label: 'Humidity', value: `${Math.round(weather.humidity * 100)}%` },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.summary}>
        <Ionicons
          name={conditionIcon(weather.conditionCode, weather.daylight)}
          size={32}
          color={Colors.warning}
        />
        <Text style={styles.temp} maxFontSizeMultiplier={MaxFontScale.display}>
          {formatTemp(weather.temperatureC, paceUnit)}
          <Text style={styles.tempUnit}>{unitLetter}</Text>
        </Text>
        <Text style={styles.condition} numberOfLines={2}>
          {conditionLabel(weather.conditionCode)}
        </Text>
      </View>

      <View style={[styles.details, large && styles.detailsLarge]}>
        {details.map((d) => (
          <View key={d.label} style={[styles.detail, large && styles.detailLarge]}>
            <Text style={styles.detailValue}>{d.value}</Text>
            <Text style={styles.detailLabel}>{d.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={() => Linking.openURL(ATTRIBUTION_URL)}
        accessibilityRole="link"
        accessibilityLabel="Apple Weather data sources"
        hitSlop={8}
      >
        <Text style={styles.attribution}>{ATTRIBUTION_LABEL} · Data sources</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  temp: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  tempUnit: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  condition: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  details: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  detailsLarge: {
    flexDirection: 'column',
  },
  detail: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceLight,
  },
  detailLarge: {
    flexGrow: 0,
    flexBasis: 'auto',
  },
  detailValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  detailLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  attribution: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
