import type { AuthService, AuthSession } from '../AuthService';

export type MockMode = 'success' | 'failure' | 'expired';

const MOCK_SESSION: AuthSession = {
  user: { id: 'mock-user-id', email: 'test@example.com', provider: 'email' },
  accessToken: 'mock-token',
  expiresAt: Date.now() / 1000 + 3600,
};

export class MockAuthService implements AuthService {
  private mode: MockMode = 'success';

  configure(mode: MockMode) {
    this.mode = mode;
    return this;
  }

  async signInWithEmail(_email: string, _password: string): Promise<AuthSession> {
    if (this.mode === 'failure') throw new Error('Invalid credentials');
    return MOCK_SESSION;
  }

  async signInWithGoogle(): Promise<AuthSession> {
    if (this.mode === 'failure') throw new Error('Google sign-in failed');
    return { ...MOCK_SESSION, user: { ...MOCK_SESSION.user, provider: 'google' } };
  }

  async signInWithApple(): Promise<AuthSession> {
    if (this.mode === 'failure') throw new Error('Apple sign-in failed');
    return { ...MOCK_SESSION, user: { ...MOCK_SESSION.user, provider: 'apple' } };
  }

  async signUp(_email: string, _password: string): Promise<AuthSession> {
    if (this.mode === 'failure') throw new Error('Sign-up failed');
    return MOCK_SESSION;
  }

  async signOut(): Promise<void> {}

  async getSession(): Promise<AuthSession | null> {
    if (this.mode === 'failure') return null;
    if (this.mode === 'expired') throw new Error('Session expired');
    return MOCK_SESSION;
  }

  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    callback(this.mode === 'success' ? MOCK_SESSION : null);
    return () => {};
  }
}
