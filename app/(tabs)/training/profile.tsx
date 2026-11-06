/**
 * Running Profile settings — tabbed UI matching the plan-creation sheet.
 * Tabs: Basics · Paces · Schedule · Preferences
 *
 * Requires an authenticated user (data is stored in Supabase).
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { supabase } from '../../../src/analytics/supabaseClient';
import {
  RunningProfile,
  RunningPreference,
  RunningPreferenceCategory,
  ExperienceLevel,
  RaceTimes,
  RaceTimeEntry,
  DayPreference,
  normalizeDayPreferences,
} from '../../../src/types/database';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../../../src/constants/theme';
import { hapticTap } from '../../../src/audio/haptics';
import { useLargeText } from '../../../src/hooks/useLargeText';

// ── Tab definitions ──────────────────────────────────────────

type TabKey = 'basics' | 'paces' | 'schedule' | 'prefs';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'basics', label: 'Basics', icon: 'person-outline' },
  { key: 'paces', label: 'Paces', icon: 'speedometer-outline' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
  { key: 'prefs', label: 'Preferences', icon: 'options-outline' },
];

// ── Presets ──────────────────────────────────────────────────

const GOAL_PRESETS = [
  'Run a faster 5K',
  'Train for a 10K',
  'Half marathon prep',
  'Marathon training',
  'Get faster overall',
  'Build endurance',
  'Couch to 5K',
  'Improve VO2 max',
  'General fitness',
  'Lose weight while running',
];

const PREFERENCE_PRESETS = [
  'I prefer intervals over steady runs',
  'I prefer steady runs over intervals',
  'Time-based workouts (not distance)',
  'Distance-based workouts (not time)',
  'Pace-based targets',
  'Effort/RPE-based targets',
  'Include walking recovery',
  'Include hill work',
  'No walking — jog recovery only',
  'Focus on negative splits',
  'I like progressive builds',
  'Minimal warmup / cooldown',
  'Keep workouts under 30 minutes',
  'Keep workouts under 45 minutes',
];

const LIMITATION_PRESETS = [
  'Recovering from injury',
  'Knee pain / issues',
  'Shin splints',
  'Plantar fasciitis',
  'IT band issues',
  'Back pain',
  'Returning after time off',
  "Can't run on consecutive days",
  'Treadmill only (weather limited)',
  'Limited to flat routes',
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; desc: string }[] = [
  { value: 'beginner', label: 'Beginner', desc: 'New to intervals or running < 6 months' },
  { value: 'intermediate', label: 'Intermediate', desc: 'Running 6+ months, comfortable with intervals' },
  { value: 'advanced', label: 'Advanced', desc: 'Experienced runner, training seriously' },
];

const DURATION_PRESETS = [
  { label: '20–30 min', min: 20, max: 30 },
  { label: '30–45 min', min: 30, max: 45 },
  { label: '45–60 min', min: 45, max: 60 },
  { label: '60–90 min', min: 60, max: 90 },
];

const MAX_DURATION_PRESETS = [
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '90 min', value: 90 },
  { label: '2 hours', value: 120 },
];

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

const CROSS_TRAINING_OPTIONS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'strength', label: 'Strength', icon: 'barbell-outline' },
  { key: 'cycling', label: 'Cycling', icon: 'bicycle-outline' },
  { key: 'swimming', label: 'Swimming', icon: 'water-outline' },
  { key: 'yoga', label: 'Yoga / Stretching', icon: 'body-outline' },
  { key: 'walking', label: 'Walking', icon: 'walk-outline' },
  { key: 'hiking', label: 'Hiking', icon: 'trail-sign-outline' },
  { key: 'hiit', label: 'HIIT / CrossFit', icon: 'flame-outline' },
  { key: 'rowing', label: 'Rowing', icon: 'boat-outline' },
];

const RACE_DISTANCES: { key: string; label: string; placeholder: string }[] = [
  { key: 'mile', label: 'Mile', placeholder: 'e.g. 8:00' },
  { key: '5k', label: '5K', placeholder: 'e.g. 25:00' },
  { key: '10k', label: '10K', placeholder: 'e.g. 52:00' },
  { key: 'half_marathon', label: 'Half Marathon', placeholder: 'e.g. 1:55:00' },
  { key: 'marathon', label: 'Marathon', placeholder: 'e.g. 4:00:00' },
];

const PACE_TIERS: { key: keyof RaceTimeEntry; label: string }[] = [
  { key: 'slow', label: 'Slow' },
  { key: 'avg', label: 'Avg' },
  { key: 'fast', label: 'Fast' },
];

// ── Pace helpers ─────────────────────────────────────────────

function paceToMMSS(decimal: number): string {
  const total = Math.round(decimal * 60);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function mmSSToPace(text: string): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  if (secs >= 60) return null;
  const decimal = mins + secs / 60;
  return decimal > 0 ? parseFloat(decimal.toFixed(2)) : null;
}

// ── Race time helpers ────────────────────────────────────────

function secondsToDisplay(seconds: number): string {
  const totalSec = Math.round(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function displayToSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const hms = trimmed.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (hms) {
    const h = parseInt(hms[1], 10);
    const m = parseInt(hms[2], 10);
    const s = parseInt(hms[3], 10);
    if (m >= 60 || s >= 60) return null;
    const total = h * 3600 + m * 60 + s;
    return total > 0 ? total : null;
  }

  const ms = trimmed.match(/^(\d{1,3}):(\d{1,2})$/);
  if (ms) {
    const m = parseInt(ms[1], 10);
    const s = parseInt(ms[2], 10);
    if (s >= 60) return null;
    const total = m * 60 + s;
    return total > 0 ? total : null;
  }

  return null;
}

// ── Race Time Row ────────────────────────────────────────────

function RaceTimeRow({
  distance,
  entry,
  onChange,
}: {
  distance: { key: string; label: string; placeholder: string };
  entry: RaceTimeEntry;
  onChange: (tier: keyof RaceTimeEntry, seconds: number | null) => void;
}) {
  const large = useLargeText();
  const [expanded, setExpanded] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({
    slow: entry.slow != null ? secondsToDisplay(entry.slow) : '',
    avg: entry.avg != null ? secondsToDisplay(entry.avg) : '',
    fast: entry.fast != null ? secondsToDisplay(entry.fast) : '',
  });

  const hasData = entry.slow != null || entry.avg != null || entry.fast != null;
  const summary = hasData
    ? PACE_TIERS.filter((t) => entry[t.key] != null).map((t) => secondsToDisplay(entry[t.key]!)).join(' · ')
    : '';

  const handleBlur = (tier: keyof RaceTimeEntry) => {
    const text = texts[tier]?.trim();
    if (!text) {
      onChange(tier, null);
      return;
    }
    const secs = displayToSeconds(text);
    if (secs != null) {
      onChange(tier, secs);
      setTexts((prev) => ({ ...prev, [tier]: secondsToDisplay(secs) }));
    } else {
      Alert.alert('Invalid time', `Enter time as M:SS, MM:SS, or H:MM:SS`);
    }
  };

  return (
    <View style={styles.raceTimeRow}>
      <TouchableOpacity
        style={styles.raceTimeHeader}
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.raceTimeLabel}>{distance.label}</Text>
          {!expanded && hasData && (
            <Text style={styles.raceTimeSummary}>{summary}</Text>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textMuted}
        />
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.raceTimeFields, large && styles.stackLarge]}>
          {PACE_TIERS.map((tier) => (
            <View key={tier.key} style={styles.raceTimeFieldWrap}>
              <Text style={styles.raceTimeTierLabel}>{tier.label}</Text>
              <TextInput
                style={styles.raceTimeField}
                value={texts[tier.key]}
                onChangeText={(v) => setTexts((prev) => ({ ...prev, [tier.key]: v }))}
                onBlur={() => handleBlur(tier.key)}
                onSubmitEditing={() => handleBlur(tier.key)}
                placeholder={distance.placeholder}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Preference Section ───────────────────────────────────────

function PreferenceSection({
  title,
  category,
  items,
  userId,
  onChanged,
  presets,
}: {
  title: string;
  category: RunningPreferenceCategory;
  items: RunningPreference[];
  userId: string;
  onChanged: () => void;
  presets: string[];
}) {
  const [newItem, setNewItem] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  const existingContent = new Set(items.map((i) => i.content));
  const availablePresets = presets.filter((p) => !existingContent.has(p));

  const addItem = async (content?: string) => {
    const value = (content ?? newItem).trim();
    if (!value) return;
    const { error } = await supabase.from('running_preferences').insert({
      user_id: userId,
      content: value,
      category,
    });
    if (error) Alert.alert('Error', error.message);
    else {
      setNewItem('');
      onChanged();
    }
  };

  const removeItem = async (id: string) => {
    await supabase.from('running_preferences').delete().eq('id', id);
    onChanged();
  };

  return (
    <View style={styles.tabSection}>
      <View style={styles.prefHeader}>
        <Text style={styles.tabSectionTitle}>{title}</Text>
        {availablePresets.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowPresets((p) => !p)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.suggestionsToggle}>
              {showPresets ? 'Hide' : 'Suggestions'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {showPresets && availablePresets.length > 0 && (
        <View style={styles.chipRow}>
          {availablePresets.map((p) => (
            <TouchableOpacity
              key={p}
              style={styles.presetChip}
              onPress={() => addItem(p)}
              activeOpacity={0.7}
            >
              <Text style={styles.presetChipText}>+ {p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {items.map((item) => (
        <View key={item.id} style={styles.prefRow}>
          <Text style={styles.prefText}>{item.content}</Text>
          <TouchableOpacity
            onPress={() => removeItem(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.content}`}
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newItem}
          onChangeText={setNewItem}
          placeholder={`Add custom ${title.toLowerCase().replace(/s$/, '')}…`}
          placeholderTextColor={Colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={() => addItem()}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => addItem()}
          accessibilityRole="button"
          accessibilityLabel={`Add ${title.toLowerCase().replace(/s$/, '')}`}
        >
          <Ionicons name="add" size={20} color={Colors.black} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────

export default function RunningProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const large = useLargeText();
  const [activeTab, setActiveTab] = useState<TabKey>('basics');
  const [profile, setProfile] = useState<RunningProfile | null>(null);
  const [preferences, setPreferences] = useState<RunningPreference[]>([]);
  const [loading, setLoading] = useState(true);

  const [easyPaceText, setEasyPaceText] = useState('');
  const [fastPaceText, setFastPaceText] = useState('');
  const [weeklyMileageText, setWeeklyMileageText] = useState('');
  const [longestRunText, setLongestRunText] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;

    const [{ data: profileData }, { data: prefData }] = await Promise.all([
      supabase
        .from('running_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('running_preferences')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at'),
    ]);

    setProfile(profileData);
    setEasyPaceText(profileData?.easy_pace != null ? paceToMMSS(profileData.easy_pace) : '');
    setFastPaceText(profileData?.fast_pace != null ? paceToMMSS(profileData.fast_pace) : '');
    setWeeklyMileageText(profileData?.weekly_mileage != null ? String(profileData.weekly_mileage) : '');
    setLongestRunText(profileData?.longest_recent_run_minutes != null ? String(profileData.longest_recent_run_minutes) : '');
    setPreferences(prefData ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const updateProfile = async (updates: Partial<RunningProfile>) => {
    if (!user) return;

    setProfile((prev) =>
      prev
        ? { ...prev, ...updates }
        : ({
            id: '',
            user_id: user.id,
            experience_level: 'beginner' as ExperienceLevel,
            typical_run_minutes: null,
            typical_run_minutes_max: null,
            easy_pace: null,
            fast_pace: null,
            race_times: null,
            weekly_mileage: null,
            longest_recent_run_minutes: null,
            max_workout_minutes: null,
            preferred_days: [],
            cross_training: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...updates,
          } as RunningProfile),
    );

    const { error } = profile
      ? await supabase
          .from('running_profiles')
          .update(updates)
          .eq('user_id', user.id)
      : await supabase.from('running_profiles').insert({
          user_id: user.id,
          ...updates,
        });

    if (error) {
      Alert.alert('Error', error.message);
    }
    fetchData();
  };

  const savePace = (field: 'easy_pace' | 'fast_pace', text: string) => {
    const trimmed = text.trim();
    if (trimmed === '') {
      updateProfile({ [field]: null });
      return;
    }
    const decimal = mmSSToPace(trimmed);
    if (decimal != null) {
      updateProfile({ [field]: decimal });
    } else {
      Alert.alert('Invalid pace', 'Enter pace as M:SS or MM:SS (e.g. 8:30)');
    }
  };

  const updateRaceTime = (distanceKey: string, tier: keyof RaceTimeEntry, seconds: number | null) => {
    const current: RaceTimes = profile?.race_times ?? {};
    const entry = current[distanceKey] ?? { slow: null, avg: null, fast: null };
    const updated: RaceTimes = {
      ...current,
      [distanceKey]: { ...entry, [tier]: seconds },
    };
    updateProfile({ race_times: updated } as Partial<RunningProfile>);
  };

  if (!user) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContent}
      >
        <View style={styles.emptyHero}>
          <Ionicons name="person-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Your Running Profile</Text>
          <Text style={styles.emptyText}>
            Set your goals, experience level, and training preferences so our
            AI can create workouts designed to help you meet your goals.
          </Text>
        </View>

        <View style={styles.emptyFeatures}>
          {[
            { icon: 'fitness-outline' as const, text: 'Experience level & typical run duration' },
            { icon: 'speedometer-outline' as const, text: 'Easy and fast pace targets' },
            { icon: 'trophy-outline' as const, text: 'Personal running goals' },
            { icon: 'options-outline' as const, text: 'Training style preferences' },
          ].map((item) => (
            <View key={item.text} style={styles.emptyFeatureRow}>
              <Ionicons name={item.icon} size={20} color={Colors.primary} />
              <Text style={styles.emptyFeatureText}>{item.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => router.push('/login')}
          activeOpacity={0.8}
        >
          <Text style={styles.signInButtonText}>Sign In to Get Started</Text>
        </TouchableOpacity>

        <Text style={styles.emptyFooter}>
          Sign in to save your profile and unlock AI-powered workouts.
        </Text>
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const goals = preferences.filter((p) => p.category === 'goal');
  const prefs = preferences.filter((p) => p.category === 'preference');
  const limitations = preferences.filter((p) => p.category === 'limitation');

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={[styles.tabBar, large && styles.tabBarLarge]}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, large && styles.tabItemLarge]}
              onPress={() => { hapticTap(); setActiveTab(tab.key); }}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                numberOfLines={large ? undefined : 1}
                maxFontSizeMultiplier={MaxFontScale.display}
              >
                {tab.label}
              </Text>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Basics tab ── */}
        {activeTab === 'basics' && (
          <View>
            <View style={styles.tabSection}>
              <Text style={styles.tabSectionTitle}>Experience Level</Text>
              <View style={styles.levelRow}>
                {EXPERIENCE_LEVELS.map((level) => {
                  const isActive = profile?.experience_level === level.value;
                  return (
                    <TouchableOpacity
                      key={level.value}
                      style={[styles.levelCard, isActive && styles.levelCardActive]}
                      onPress={() => { hapticTap(); updateProfile({ experience_level: level.value }); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.levelLabel, isActive && styles.levelLabelActive]}>
                        {level.label}
                      </Text>
                      <Text style={styles.levelDesc}>{level.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.tabSection}>
              <Text style={styles.tabSectionTitle}>Current Fitness</Text>
              <View style={[styles.fitnessRow, large && styles.stackLarge]}>
                <View style={styles.fitnessInput}>
                  <Text style={styles.fieldLabel}>Weekly mileage</Text>
                  <View style={styles.fieldWithUnit}>
                    <TextInput
                      style={[styles.field, { flex: 1 }]}
                      value={weeklyMileageText}
                      onChangeText={setWeeklyMileageText}
                      onBlur={() => {
                        const v = weeklyMileageText.trim();
                        if (!v) updateProfile({ weekly_mileage: null } as Partial<RunningProfile>);
                        else {
                          const n = parseFloat(v);
                          if (!isNaN(n) && n > 0) updateProfile({ weekly_mileage: n } as Partial<RunningProfile>);
                        }
                      }}
                      placeholder="e.g. 20"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      maxLength={5}
                      returnKeyType="done"
                    />
                    <Text style={styles.fieldUnit}>mi/wk</Text>
                  </View>
                </View>
                <View style={styles.fitnessInput}>
                  <Text style={styles.fieldLabel}>Longest recent run</Text>
                  <View style={styles.fieldWithUnit}>
                    <TextInput
                      style={[styles.field, { flex: 1 }]}
                      value={longestRunText}
                      onChangeText={setLongestRunText}
                      onBlur={() => {
                        const v = longestRunText.trim();
                        if (!v) updateProfile({ longest_recent_run_minutes: null } as Partial<RunningProfile>);
                        else {
                          const n = parseInt(v, 10);
                          if (!isNaN(n) && n > 0) updateProfile({ longest_recent_run_minutes: n } as Partial<RunningProfile>);
                        }
                      }}
                      placeholder="e.g. 60"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="number-pad"
                      maxLength={3}
                      returnKeyType="done"
                    />
                    <Text style={styles.fieldUnit}>min</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.tabSection}>
              <Text style={styles.tabSectionTitle}>Typical Run Duration</Text>
              <View style={styles.chipRow}>
                {DURATION_PRESETS.map((preset) => {
                  const isActive =
                    profile?.typical_run_minutes === preset.min &&
                    profile?.typical_run_minutes_max === preset.max;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.durationChip, isActive && styles.durationChipActive]}
                      onPress={() => {
                        hapticTap();
                        updateProfile({ typical_run_minutes: preset.min, typical_run_minutes_max: preset.max } as Partial<RunningProfile>);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.durationChipText, isActive && styles.durationChipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ── Paces tab ── */}
        {activeTab === 'paces' && (
          <View>
            <View style={styles.tabSection}>
              <Text style={styles.tabSectionTitle}>Your Paces (min/mile)</Text>
              <Text style={styles.tabSectionSub}>
                Enter as minutes:seconds — e.g. 9:30
              </Text>
              <View style={[styles.paceRow, large && styles.stackLarge]}>
                <View style={styles.paceInput}>
                  <Text style={styles.fieldLabel}>Easy pace</Text>
                  <TextInput
                    style={styles.field}
                    value={easyPaceText}
                    onChangeText={setEasyPaceText}
                    onBlur={() => savePace('easy_pace', easyPaceText)}
                    onSubmitEditing={() => savePace('easy_pace', easyPaceText)}
                    placeholder="e.g. 10:00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="done"
                  />
                </View>
                <View style={styles.paceInput}>
                  <Text style={styles.fieldLabel}>Fast pace</Text>
                  <TextInput
                    style={styles.field}
                    value={fastPaceText}
                    onChangeText={setFastPaceText}
                    onBlur={() => savePace('fast_pace', fastPaceText)}
                    onSubmitEditing={() => savePace('fast_pace', fastPaceText)}
                    placeholder="e.g. 7:30"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>

            <View style={styles.tabSection}>
              <View style={styles.raceTimeTitleRow}>
                <Text style={styles.tabSectionTitle}>Race Times</Text>
                <Text style={styles.optionalBadge}>Optional</Text>
              </View>
              <Text style={styles.tabSectionSub}>
                Know your times? Even one helps the AI calibrate your plan. Tap a distance to enter times.
              </Text>
              {RACE_DISTANCES.map((dist) => (
                <RaceTimeRow
                  key={dist.key}
                  distance={dist}
                  entry={profile?.race_times?.[dist.key] ?? { slow: null, avg: null, fast: null }}
                  onChange={(tier, seconds) => updateRaceTime(dist.key, tier, seconds)}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Schedule tab ── */}
        {activeTab === 'schedule' && (
          <View>
            <View style={styles.tabSection}>
              <Text style={styles.tabSectionTitle}>Training Days</Text>
              <Text style={styles.tabSectionSub}>
                Tap once for flexible, twice for locked in. Locked days always get a workout; flexible days can shift if life gets busy.
              </Text>
              <View style={[styles.dayChipsRow, large && styles.dayChipsRowLarge]}>
                {DAYS_OF_WEEK.map((day) => {
                  const days = normalizeDayPreferences(profile?.preferred_days);
                  const entry = days.find((d) => d.day === day.key);
                  const state: 'off' | 'flexible' | 'locked' = !entry ? 'off' : entry.locked ? 'locked' : 'flexible';
                  return (
                    <TouchableOpacity
                      key={day.key}
                      style={[
                        styles.dayChip,
                        large && styles.dayChipLarge,
                        state === 'flexible' && styles.dayChipFlexible,
                        state === 'locked' && styles.dayChipLocked,
                      ]}
                      onPress={() => {
                        hapticTap();
                        const current = normalizeDayPreferences(profile?.preferred_days);
                        let updated: DayPreference[];
                        if (state === 'off') {
                          updated = [...current, { day: day.key, locked: false }];
                        } else if (state === 'flexible') {
                          updated = current.map((d) => d.day === day.key ? { ...d, locked: true } : d);
                        } else {
                          updated = current.filter((d) => d.day !== day.key);
                        }
                        updateProfile({ preferred_days: updated } as Partial<RunningProfile>);
                      }}
                      activeOpacity={0.7}
                    >
                      {state === 'locked' && (
                        <Ionicons name="lock-closed" size={10} color={Colors.primary} style={{ marginBottom: 1 }} />
                      )}
                      <Text
                        style={[
                          styles.dayChipText,
                          state === 'flexible' && styles.dayChipTextFlexible,
                          state === 'locked' && styles.dayChipTextLocked,
                        ]}
                        maxFontSizeMultiplier={MaxFontScale.display}
                      >
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.dayLegend}>
                <View style={styles.dayLegendItem}>
                  <View style={[styles.dayLegendDot, { borderColor: Colors.primary, backgroundColor: 'transparent' }]} />
                  <Text style={styles.dayLegendText}>Flexible</Text>
                </View>
                <View style={styles.dayLegendItem}>
                  <View style={[styles.dayLegendDot, { borderColor: Colors.primary, backgroundColor: Colors.primary + '25' }]}>
                    <Ionicons name="lock-closed" size={6} color={Colors.primary} />
                  </View>
                  <Text style={styles.dayLegendText}>Locked in</Text>
                </View>
              </View>
            </View>

            <View style={styles.tabSection}>
              <Text style={styles.tabSectionTitle}>Max Workout Duration</Text>
              <View style={styles.chipRow}>
                {MAX_DURATION_PRESETS.map((preset) => {
                  const isActive = profile?.max_workout_minutes === preset.value;
                  return (
                    <TouchableOpacity
                      key={preset.value}
                      style={[styles.durationChip, isActive && styles.durationChipActive]}
                      onPress={() => {
                        hapticTap();
                        updateProfile({ max_workout_minutes: isActive ? null : preset.value } as Partial<RunningProfile>);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.durationChipText, isActive && styles.durationChipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.tabSection}>
              <Text style={styles.tabSectionTitle}>Cross Training</Text>
              <Text style={styles.tabSectionSub}>
                Other activities you do regularly
              </Text>
              <View style={styles.crossGrid}>
                {CROSS_TRAINING_OPTIONS.map((opt) => {
                  const selected = (profile?.cross_training ?? []).includes(opt.key);
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.crossChip, selected && styles.crossChipActive]}
                      onPress={() => {
                        hapticTap();
                        const current: string[] = profile?.cross_training ?? [];
                        const updated = selected
                          ? current.filter((k) => k !== opt.key)
                          : [...current, opt.key];
                        updateProfile({ cross_training: updated } as Partial<RunningProfile>);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={16}
                        color={selected ? Colors.primary : Colors.textMuted}
                      />
                      <Text style={[styles.crossChipText, selected && styles.crossChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ── Preferences tab ── */}
        {activeTab === 'prefs' && (
          <View>
            <PreferenceSection
              title="Goals"
              category="goal"
              items={goals}
              userId={user.id}
              onChanged={fetchData}
              presets={GOAL_PRESETS}
            />
            <PreferenceSection
              title="Training Style"
              category="preference"
              items={prefs}
              userId={user.id}
              onChanged={fetchData}
              presets={PREFERENCE_PRESETS}
            />
            <PreferenceSection
              title="Limitations"
              category="limitation"
              items={limitations}
              userId={user.id}
              onChanged={fetchData}
              presets={LIMITATION_PRESETS}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight,
  },
  tabBarLarge: {
    flexWrap: 'wrap',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    gap: 3,
    position: 'relative',
  },
  tabItemLarge: {
    flexBasis: '50%',
  },
  tabLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: Spacing.sm,
    right: Spacing.sm,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },

  // Scroll content
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
  },

  // Tab sections
  tabSection: {
    marginBottom: Spacing.lg,
  },
  tabSectionTitle: {
    flexShrink: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  tabSectionSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },

  // Experience level
  levelRow: {
    gap: Spacing.sm,
  },
  levelCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  levelCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  levelLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  levelLabelActive: {
    color: Colors.primary,
  },
  levelDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  stackLarge: {
    flexDirection: 'column',
  },

  // Fitness / field helpers
  fitnessRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  fitnessInput: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  field: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  fieldWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fieldUnit: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  // Duration chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  durationChip: {
    flexShrink: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  durationChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  durationChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  durationChipTextActive: {
    color: Colors.primary,
  },

  // Paces
  paceRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  paceInput: {
    flex: 1,
  },

  // Race times
  raceTimeTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  optionalBadge: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  raceTimeRow: {
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  raceTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  raceTimeLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  raceTimeSummary: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  raceTimeFields: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  raceTimeFieldWrap: {
    flex: 1,
  },
  raceTimeTierLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  raceTimeField: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },

  // Schedule — day chips
  dayChipsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  dayChipsRowLarge: {
    flexWrap: 'wrap',
  },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  dayChipLarge: {
    flexBasis: '22%',
  },
  dayChipFlexible: {
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
  },
  dayChipLocked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '20',
  },
  dayChipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  dayChipTextFlexible: {
    color: Colors.primary,
  },
  dayChipTextLocked: {
    color: Colors.primary,
  },
  dayLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  dayLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dayLegendDot: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLegendText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Cross training grid
  crossGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  crossChip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  crossChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  crossChipText: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  crossChipTextActive: {
    color: Colors.primary,
  },

  // Preferences tab
  prefHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  suggestionsToggle: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
  presetChip: {
    flexShrink: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    marginBottom: Spacing.xs,
  },
  presetChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  prefText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    marginRight: Spacing.sm,
  },
  addRow: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  addInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty / sign-in state
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl * 2,
  },
  emptyHero: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyFeatures: {
    alignSelf: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  emptyFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyFeatureText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    flex: 1,
  },
  signInButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'stretch',
  },
  signInButtonText: {
    color: Colors.black,
    fontSize: FontSize.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyFooter: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
