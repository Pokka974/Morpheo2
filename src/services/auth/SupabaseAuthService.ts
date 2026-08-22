import type { AuthService, AuthSession, AuthUser } from './AuthService';
import { supabase } from '../../supabase/client';
import type { Session } from '@supabase/supabase-js';

function sessionToAuthSession(session: Session): AuthSession {
  const provider = session.user.app_metadata['provider'] ?? 'email';
  const authUser: AuthUser = {
    id: session.user.id,
    email: session.user.email ?? null,
    provider: provider === 'google' ? 'google' : provider === 'apple' ? 'apple' : 'email',
  };
  return {
    user: authUser,
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? 0,
  };
}

export class SupabaseAuthService implements AuthService {
  async signInWithEmail(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'Sign in failed');
    return sessionToAuthSession(data.session);
  }

  async signInWithGoogle(): Promise<AuthSession> {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const { idToken } = await GoogleSignin.getTokens();
    if (!idToken) throw new Error('No Google ID token');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error || !data.session) throw new Error(error?.message ?? 'Google sign-in failed');
    return sessionToAuthSession(data.session);
  }

  async signInWithApple(): Promise<AuthSession> {
    const AppleAuthentication = await import('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error('No Apple identity token');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error || !data.session) throw new Error(error?.message ?? 'Apple sign-in failed');
    return sessionToAuthSession(data.session);
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? 'Sign up failed');
    return sessionToAuthSession(data.session);
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return sessionToAuthSession(data.session);
  }

  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session ? sessionToAuthSession(session) : null);
    });
    return () => subscription.unsubscribe();
  }
}
