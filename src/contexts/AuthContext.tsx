/**
 * Authentication context for SplitCue.
 *
 * Supports Apple Sign-In, Google Sign-In (OAuth), and email OTP.
 * Ported from the Setpoint AI AuthContext pattern.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  EXTERNAL SETUP REQUIRED — see SETUP.md                │
 * │                                                        │
 * │  1. Enable Apple & Google providers in Supabase Auth    │
 * │  2. Configure Apple Sign-In capability in Xcode        │
 * │  3. Set up Google OAuth credentials (GCP console)      │
 * │  4. Add `expo-apple-authentication` to app config      │
 * │  5. Add `expo-web-browser` to app config               │
 * └─────────────────────────────────────────────────────────┘
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { supabase } from '../analytics/supabaseClient';

const configScheme = Constants.expoConfig?.scheme;
const SCHEME = (Array.isArray(configScheme) ? configScheme[0] : configScheme) ?? 'pacecue';
const REDIRECT_URI = `${SCHEME}://auth/callback`;

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithApple: () => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
  isAppleSignInAvailable: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAppleSignInAvailable, setIsAppleSignInAvailable] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setIsAppleSignInAvailable);
    }
  }, []);

  // ─── Apple Sign In ──────────────────────────────────────

  const signInWithApple = async (): Promise<{ error: Error | null }> => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        return { error: new Error('No identity token returned from Apple') };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (!error && credential.fullName) {
        const displayName = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ]
          .filter(Boolean)
          .join(' ');
        if (displayName) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('profiles')
              .update({ display_name: displayName })
              .eq('id', user.id);
          }
        }
      }

      return { error };
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') {
        return { error: null };
      }
      return { error: e };
    }
  };

  // ─── Google Sign In ─────────────────────────────────────

  const signInWithGoogle = async (): Promise<{ error: Error | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: REDIRECT_URI,
          skipBrowserRedirect: true,
        },
      });

      if (error) return { error };
      if (!data?.url) return { error: new Error('No OAuth URL returned') };

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        REDIRECT_URI,
      );

      if (result.type === 'success' && result.url) {
        const fragment = result.url.split('#')[1];
        if (fragment) {
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            return { error: sessionError };
          }
        }
      }

      return { error: null };
    } catch (e: any) {
      return { error: e };
    }
  };

  // ─── Email OTP (magic code) ─────────────────────────────

  const signInWithOtp = async (
    email: string,
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    return { error };
  };

  const verifyOtp = async (
    email: string,
    token: string,
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    return { error };
  };

  // ─── Sign out ──────────────────────────────────────────

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // ─── Delete account ────────────────────────────────────
  // Calls a Supabase RPC that deletes the user from auth.users.
  // All user data cascades automatically via ON DELETE CASCADE FKs.

  const deleteAccount = async (): Promise<{ error: Error | null }> => {
    try {
      const { error: rpcError } = await supabase.rpc('delete_own_account');
      if (rpcError) {
        return { error: new Error(rpcError.message) };
      }
      await supabase.auth.signOut();
      return { error: null };
    } catch (e: any) {
      return { error: e };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithApple,
        signInWithGoogle,
        signInWithOtp,
        verifyOtp,
        signOut,
        deleteAccount,
        isAppleSignInAvailable,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
