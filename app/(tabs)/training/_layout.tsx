import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function TrainingLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Training' }} />
      <Stack.Screen name="overview" options={{ title: 'Plan Overview' }} />
      <Stack.Screen name="workout-detail" options={{ title: 'Workout' }} />
      <Stack.Screen name="setup" options={{ title: 'Create Plan' }} />
      <Stack.Screen name="profile" options={{ title: 'Running Profile' }} />
      <Stack.Screen name="chat" options={{ title: 'Adjust Plan' }} />
      <Stack.Screen name="stats" options={{ title: 'Stats & Records' }} />
      <Stack.Screen name="history" options={{ title: 'History' }} />
    </Stack>
  );
}
