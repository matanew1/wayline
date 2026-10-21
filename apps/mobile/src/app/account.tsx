import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, I18nManager, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentUser, getAccessToken, requestOtp, signOut, verifyOtp } from '@/api/auth';
import { deleteAccount, savedPlaces } from '@/api/wayline';
import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/ui';
import { useT } from '@/i18n';
import { setSetting, useSettings } from '@/state/settings';
import { set, toast } from '@/state/store';
import { toE164 } from '@/lib/phone';
import { colors } from '@/theme';

export default function AccountScreen() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const savedPhone = useSettings((s) => s.phone);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = currentUser();
  const signedIn = !!user && !user.guest;

  async function send() {
    const e164 = toE164(phone);
    if (!e164) { setError(t('invalidPhone')); return; }
    setBusy(true); setError(null);
    try {
      const res = await requestOtp(e164);
      setSentTo(e164);
      setCode(res.devCode ?? ''); // dev builds: the API echoes the code
    } catch (e) {
      setError(e instanceof Error ? e.message : t('somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sentTo) return;
    setBusy(true); setError(null);
    try {
      await verifyOtp(sentTo, code.trim());
      setSetting('phone', sentTo);
      // the account may have places from another phone
      savedPlaces().then((saved) => set({ saved })).catch(() => undefined);
      toast(t('signedIn'));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('deleteConfirmTitle'), t('deleteConfirmBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteAccount();
            await signOut();
            setSetting('phone', null);
            set({ saved: [] });
            await getAccessToken().catch(() => undefined); // continue as a new guest
            toast(t('accountDeleted'));
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('somethingWrong'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function logout() {
    await signOut();
    setSetting('phone', null);
    set({ saved: [] });
    await getAccessToken().catch(() => undefined); // new guest session
    toast(t('signedOut'));
    router.back();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <Icon name="back" size={24} />
          </Pressable>
          <Text style={styles.title}>{t('accountTitle')}</Text>
        </View>

        {signedIn ? (
          <View style={{ gap: 16 }}>
            <Text style={styles.body}>{t('signedInAs', { phone: savedPhone ?? '' })}</Text>
            <PrimaryButton title={t('signOut')} tone="secondary" onPress={() => void logout()} testID="sign-out" />
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            {busy ? <ActivityIndicator color={colors.primary} /> : (
              <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.danger} testID="delete-account">
                <Text style={styles.dangerText}>{t('deleteAccount')}</Text>
              </Pressable>
            )}
          </View>
        ) : !sentTo ? (
          <View style={{ gap: 12 }}>
            <Text style={styles.label}>{t('phoneLabel')}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="050-123-4567"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              accessibilityLabel={t('phoneLabel')}
              testID="phone-input"
              style={[styles.input, { textAlign: I18nManager.isRTL ? 'right' : 'left' }]}
            />
            <Text style={styles.hint}>{t('phoneHint')}</Text>
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            {busy ? <ActivityIndicator color={colors.primary} /> : <PrimaryButton title={t('sendCode')} disabled={!phone.trim()} onPress={() => void send()} testID="send-code" />}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={styles.body}>{t('codeSent', { to: sentTo })}</Text>
            <Text style={styles.label}>{t('codeLabel')}</Text>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              accessibilityLabel={t('codeLabel')}
              testID="code-input"
              style={[styles.input, styles.code]}
            />
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            {busy ? <ActivityIndicator color={colors.primary} /> : <PrimaryButton title={t('verify')} disabled={code.length !== 6} onPress={() => void verify()} testID="verify-code" />}
            <Pressable accessibilityRole="button" onPress={() => { setSentTo(null); setCode(''); }} style={{ padding: 12 }}>
              <Text style={styles.link}>{t('resend')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginStart: -12 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  label: { fontSize: 14, fontWeight: '700', color: colors.sub, textAlign: 'left' },
  body: { fontSize: 16, color: colors.ink, textAlign: 'left' },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'left' },
  input: { height: 52, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, paddingHorizontal: 14, fontSize: 18, color: colors.ink },
  code: { letterSpacing: 8, textAlign: 'center', fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, fontSize: 14, textAlign: 'left' },
  danger: { marginTop: 24, padding: 14, alignItems: 'center' },
  dangerText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  link: { color: colors.primary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
