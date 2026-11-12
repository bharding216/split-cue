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
      <Stack.Screen name="pace" options={{ title: 'Pace Tracking' }} />
      <Stack.Screen name="heart-rate" options={{ title: 'Heart Rate Monitor' }} />
      <Stack.Screen name="general" options={{ title: 'General' }} />
      <Stack.Screen name="sharing" options={{ title: 'Sharing' }} />
      <Stack.Screen name="profile" options={{ title: 'Running Profile' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="about" options={{ title: 'Share & Feedback' }} />
    </Stack>
  );
}
