import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabasePublishableKey as string, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function ensureAnonymousSession(): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured yet. Add the EXPO_PUBLIC_SUPABASE values to .env.local.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session.user.id;
  const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) throw signInError;
  if (!signInData.user) throw new Error('Supabase did not return an anonymous user.');
  return signInData.user.id;
}
