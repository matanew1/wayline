// Registers the background location task — must load before anything else.
import '@/location/location';

import {
  Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold, useFonts,
} from '@expo-google-fonts/figtree';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyLayoutDirection } from '@/i18n';
import { useSettings } from '@/state/settings';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const hydrated = useSettings((s) => s.hydrated);
  const c = useTheme();
  const [ready, setReady] = useState(false);
  // A font that fails to load falls back to the system face — never block the app on it.
  const [fontsLoaded, fontError] = useFonts({ Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold });

  // Wait for persisted settings, then make sure layout direction matches the language
  // (restarts once when switching between Hebrew and English).
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    applyLayoutDirection().then((restarting) => { if (alive && !restarting) setReady(true); });
    return () => { alive = false; };
  }, [hydrated]);

  if (!ready || (!fontsLoaded && !fontError)) return <View style={{ flex: 1, backgroundColor: c.mapBg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }}>
        <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: c.mapBg } }} />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_left' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
