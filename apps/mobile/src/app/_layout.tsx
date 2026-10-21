// Registers the background location task — must load before anything else.
import '@/location/location';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyLayoutDirection } from '@/i18n';
import { useSettings } from '@/state/settings';

export default function RootLayout() {
  const hydrated = useSettings((s) => s.hydrated);
  const [ready, setReady] = useState(false);

  // Wait for persisted settings, then make sure layout direction matches the language
  // (restarts once when switching between Hebrew and English).
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    applyLayoutDirection().then((restarting) => { if (alive && !restarting) setReady(true); });
    return () => { alive = false; };
  }, [hydrated]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#E9EDF1' }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
