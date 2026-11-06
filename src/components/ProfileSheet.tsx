/**
 * ProfileSheet — bottom-sheet modal for editing the running profile
 * during plan creation. Splits the full profile into 4 focused tabs
 * so the user doesn't have to scroll through a huge form.
 *
 * Tabs: Basics · Paces · Schedule · Preferences
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../analytics/supabaseClient';
import type {
  RunningProfile,
  RunningPreference,
  RunningPreferenceCategory,
  ExperienceLevel,
  DayPreference,
} from '../types/database';
import { normalizeDayPreferences } from '../types/database';
import { Colors, Spacing, FontSize, BorderRadius, MaxFontScale } from '../constants/theme';
import { hapticTap } from '../audio/haptics';
import { useLargeText } from '../hooks/useLargeText';

// ── Props ────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
}

// ── Tab definitions ──────────────────────────────────────────

type TabKey = 'basics' | 'paces' | 'schedule' | 'prefs';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'basics', label: 'Basics', icon: 'person-outline' },
  { key: 'paces', label: 'Paces', icon: 'speedometer-outline' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
  { key: 'prefs', label: 'Preferences', icon: 'options-outline' },
];

// ── Presets ──────────────────────────────────────────────────

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


const GOAL_PRESETS = [
  'Run a faster 5K', 'Train for a 10K', 'Half marathon prep',
  'Marathon training', 'Get faster overall', 'Build endurance',
  'Couch to 5K', 'Improve VO2 max', 'General fitness',
];

const PREFERENCE_PRESETS = [
  'I prefer intervals over steady runs',
  'I prefer steady runs over intervals',
  'Time-based workouts (not distance)',
  'Distance-based workouts (not time)',
  'Pace-based targets',
  'Effort/RPE-based targets',
  'Include hill work',
  'Keep workouts under 45 minutes',
];

const LIMITATION_PRESETS = [
  'Recovering from injury', 'Knee pain / issues',
  'Shin splints', 'Plantar fasciitis',
  'Returning after time off', "Can't run on consecutive days",
  'Treadmill only (weather limited)', 'Limited to flat routes',
];

// ── Pace helpers ─────────────────────────────────────────────

function paceToMMSS(decimal: number): string {
  const total = Math.round(decimal * 60);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function mmSSToPace(text: string): number | null {
  const match = text.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  if (secs >= 60) return null;
  const decimal = mins + secs / 60;
  return decimal > 0 ? parseFloat(decimal.toFixed(2)) : null;
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
    else { setNewItem(''); onChanged(); }
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

// ── Main Component ───────────────────────────────────────────

export function ProfileSheet({ visible, userId, onClose }: Props) {
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
    const [{ data: profileData }, { data: prefData }] = await Promise.all([
      supabase.from('running_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('running_preferences').select('*').eq('user_id', userId).order('created_at'),
    ]);
    setProfile(profileData);
    setEasyPaceText(profileData?.easy_pace != null ? paceToMMSS(profileData.easy_pace) : '');
    setFastPaceText(profileData?.fast_pace != null ? paceToMMSS(profileData.fast_pace) : '');
    setWeeklyMileageText(profileData?.weekly_mileage != null ? String(profileData.weekly_mileage) : '');
    setLongestRunText(profileData?.longest_recent_run_minutes != null ? String(profileData.longest_recent_run_minutes) : '');
    setPreferences(prefData ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setActiveTab('basics');
      fetchData();
    }
  }, [visible, fetchData]);

  const updateProfile = useCallback(async (updates: Partial<RunningProfile>) => {
    setProfile((prev) =>
      prev
        ? { ...prev, ...updates }
        : ({
            id: '', user_id: userId,
            experience_level: 'beginner' as ExperienceLevel,
            typical_run_minutes: null, typical_run_minutes_max: null,
            easy_pace: null, fast_pace: null, race_times: null,
            weekly_mileage: null, longest_recent_run_minutes: null,
            max_workout_minutes: null, preferred_days: [], cross_training: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...updates,
          } as RunningProfile),
    );

    const { error } = profile
      ? await supabase.from('running_profiles').update(updates).eq('user_id', userId)
      : await supabase.from('running_profiles').insert({ user_id: userId, ...updates });

    if (error) Alert.alert('Error', error.message);
    fetchData();
  }, [profile, userId, fetchData]);

  const savePace = useCallback((field: 'easy_pace' | 'fast_pace', text: string) => {
    const trimmed = text.trim();
    if (trimmed === '') { updateProfile({ [field]: null }); return; }
    const decimal = mmSSToPace(trimmed);
    if (decimal != null) updateProfile({ [field]: decimal });
    else Alert.alert('Invalid pace', 'Enter pace as M:SS or MM:SS (e.g. 8:30)');
  }, [updateProfile]);


  const goals = preferences.filter((p) => p.category === 'goal');
  const prefs = preferences.filter((p) => p.category === 'preference');
  const limitations = preferences.filter((p) => p.category === 'limitation');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, large && styles.sheetLarge]}>
          {/* Drag handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} maxFontSizeMultiplier={MaxFontScale.display}>Running Profile</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

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
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
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

                </View>
              )}

              {/* ── Schedule tab ── */}
              {activeTab === 'schedule' && (
                <View>
                  <View style={styles.tabSection}>
                    <Text style={styles.tabSectionTitle}>Training Days</Text>
                    <Text style={styles.tabSectionSub}>
                      Tap once for flexible, twice for locked in.
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
                    userId={userId}
                    onChanged={fetchData}
                    presets={GOAL_PRESETS}
                  />
                  <PreferenceSection
                    title="Training Style"
                    category="preference"
                    items={prefs}
                    userId={userId}
                    onChanged={fetchData}
                    presets={PREFERENCE_PRESETS}
                  />
                  <PreferenceSection
                    title="Limitations"
                    category="limitation"
                    items={limitations}
                    userId={userId}
                    onChanged={fetchData}
                    presets={LIMITATION_PRESETS}
                  />
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    height: '82%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  sheetLarge: {
    height: '92%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
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

  // Content area
  loadingWrap: {
    paddingVertical: Spacing.xxl * 2,
    alignItems: 'center',
  },
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
});
