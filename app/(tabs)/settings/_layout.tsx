import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="audio" options={{ title: 'Audio & Cues' }} />
      <Stack.Screen name="pace" options={{ title: 'Pace & Distance' }} />
      <Stack.Screen name="heart-rate" options={{ title: 'Heart Rate' }} />
      <Stack.Screen name="workout-preferences" options={{ title: 'Workout Preferences' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="data-backup" options={{ title: 'Data & Backup' }} />
      <Stack.Screen name="profile" options={{ title: 'Running Profile' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="about" options={{ title: 'Help & Feedback' }} />
    </Stack>
  );
}
