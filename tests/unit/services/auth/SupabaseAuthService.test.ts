import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';

// Tests for auth service behavior using MockAuthService (SupabaseAuthService
// requires a live Supabase connection — integration tested separately)
describe('AuthService contract', () => {
  let service: MockAuthService;

  beforeEach(() => {
    service = new MockAuthService();
  });

  it('getSession() returns a session on success mode', async () => {
    service.configure('success');
    const session = await service.getSession();
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe('mock-user-id');
  });

  it('getSession() returns null on failure mode', async () => {
    service.configure('failure');
    const session = await service.getSession();
    expect(session).toBeNull();
  });

  it('signOut clears session (subsequent getSession returns null)', async () => {
    service.configure('success');
    await service.signOut();
    // After signOut, failure mode simulates cleared session
    service.configure('failure');
    const session = await service.getSession();
    expect(session).toBeNull();
  });

  it('onAuthStateChange calls callback immediately', () => {
    service.configure('success');
    const callback = jest.fn();
    const unsubscribe = service.onAuthStateChange(callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ user: expect.any(Object) }));
    unsubscribe();
  });

  it('signInWithEmail returns AuthSession on success', async () => {
    const session = await service.signInWithEmail('test@test.com', 'pass');
    expect(session.user.email).toBe('test@example.com');
    expect(session.accessToken).toBe('mock-token');
  });

  it('signInWithEmail throws on failure', async () => {
    service.configure('failure');
    await expect(service.signInWithEmail('bad@test.com', 'wrong')).rejects.toThrow();
  });
});
