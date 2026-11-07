/**
 * Local reminders for planned calendar runs.
 *
 * A reminder fires on the morning of the planned day, plus one follow-up the
 * next evening if the run hasn't been done by then. Tapping either opens the
 * Training tab on that day with the workout highlighted. Permission is only
 * requested when the user asks for a reminder.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { track } from '../analytics/track';

const STORAGE_KEY = '@pacecue/run_reminders';
const CHANNEL_ID = 'run_reminders';
const MORNING_HOUR = 7;
const MORNING_MINUTE = 30;
const FOLLOW_UP_HOUR = 18;

type ReminderKind = 'morning' | 'follow_up';

interface StoredReminder {
  date: string;
  name: string;
  notificationIds: string[];
}

type ReminderMap = Record<string, StoredReminder>;

export type ScheduleResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'too_late' | 'unavailable' };

async function loadReminders(): Promise<ReminderMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReminderMap) : {};
  } catch {
    return {};
  }
}

async function saveReminders(map: ReminderMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function atLocalTime(dateKey: string, hour: number, minute: number, addDays = 0): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d + addDays, hour, minute, 0, 0);
}

function daysUntil(dateKey: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((atLocalTime(dateKey, 0, 0).getTime() - today.getTime()) / 86400000);
}

function isGranted(settings: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS === 'ios') {
    const status = settings.ios?.status;
    return (
      status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      status === Notifications.IosAuthorizationStatus.EPHEMERAL
    );
  }
  return settings.granted;
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android 13 shows no permission prompt until a channel exists.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Run reminders',
      importance: Notifications.AndroidImportance.HIGH,
      description: 'Reminders for runs you put on your calendar',
    });
  }
  let settings = await Notifications.getPermissionsAsync();
  if (isGranted(settings)) return true;
  if (!settings.canAskAgain) return false;
  settings = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return isGranted(settings);
}

function reminderUrl(planWorkoutId: string, date: string, kind: ReminderKind): string {
  const params = new URLSearchParams({ date, highlight: planWorkoutId, from: 'reminder', kind });
  return `/training?${params.toString()}`;
}

async function scheduleAt(
  when: Date,
  title: string,
  body: string,
  url: string,
): Promise<string | null> {
  if (when.getTime() <= Date.now() + 60_000) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data: { url }, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID,
    },
  });
}

async function scheduleNotifications(planWorkoutId: string, date: string, name: string): Promise<string[]> {
  const ids = await Promise.all([
    scheduleAt(
      atLocalTime(date, MORNING_HOUR, MORNING_MINUTE),
      'Run day',
      `${name} is on your calendar today.`,
      reminderUrl(planWorkoutId, date, 'morning'),
    ),
    scheduleAt(
      atLocalTime(date, FOLLOW_UP_HOUR, 0, 1),
      'Still time for your run',
      `${name} is waiting. Even a short version counts.`,
      reminderUrl(planWorkoutId, date, 'follow_up'),
    ),
  ]);
  return ids.filter((id): id is string => !!id);
}

/** Schedule reminders for a planned run, asking for notification permission if needed. */
export async function scheduleRunReminder(planWorkoutId: string, date: string, name: string): Promise<ScheduleResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unavailable' };

  if (!(await ensurePermission())) {
    track('run_reminder_denied', { days_out: daysUntil(date) });
    return { ok: false, reason: 'denied' };
  }

  await cancelStored(planWorkoutId);
  const ids = await scheduleNotifications(planWorkoutId, date, name);
  if (ids.length === 0) return { ok: false, reason: 'too_late' };

  const map = await loadReminders();
  map[planWorkoutId] = { date, name, notificationIds: ids };
  await saveReminders(map);

  track('run_reminder_scheduled', {
    days_out: daysUntil(date),
    has_morning: atLocalTime(date, MORNING_HOUR, MORNING_MINUTE).getTime() > Date.now(),
    notification_count: ids.length,
  });
  return { ok: true };
}

async function cancelStored(planWorkoutId: string): Promise<StoredReminder | null> {
  const map = await loadReminders();
  const existing = map[planWorkoutId];
  if (!existing) return null;
  await Promise.all(
    existing.notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
  delete map[planWorkoutId];
  await saveReminders(map);
  return existing;
}

/** Cancel any reminder for a plan workout, e.g. once it's completed or removed. */
export async function cancelRunReminder(
  planWorkoutId: string,
  reason: 'completed' | 'removed' | 'moved',
): Promise<void> {
  if (Platform.OS === 'web') return;
  const existing = await cancelStored(planWorkoutId);
  if (existing) track('run_reminder_cancelled', { reason });
}

/** Move an existing reminder to a plan workout's new date. No-op when none was set. */
export async function rescheduleRunReminder(planWorkoutId: string, newDate: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const existing = await cancelStored(planWorkoutId);
  if (!existing) return;
  track('run_reminder_cancelled', { reason: 'moved' });
  const ids = await scheduleNotifications(planWorkoutId, newDate, existing.name);
  if (ids.length === 0) return;
  const map = await loadReminders();
  map[planWorkoutId] = { ...existing, date: newDate, notificationIds: ids };
  await saveReminders(map);
  track('run_reminder_scheduled', { days_out: daysUntil(newDate), notification_count: ids.length, rescheduled: true });
}

export async function hasRunReminder(planWorkoutId: string): Promise<boolean> {
  const map = await loadReminders();
  return !!map[planWorkoutId];
}
