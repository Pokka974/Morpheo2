// Mock supabase client before import to avoid env var validation throwing
jest.mock('@features/../supabase/client', () => ({ supabase: {} }));

import { AuthExpiredError } from '@features/dream-log/syncService';

// syncService integration tests require a real Supabase instance.
// Unit tests cover the error class contract.

describe('AuthExpiredError', () => {
  it('is an instance of Error', () => {
    const error = new AuthExpiredError();
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const error = new AuthExpiredError();
    expect(error.name).toBe('AuthExpiredError');
  });

  it('has a descriptive message', () => {
    const error = new AuthExpiredError();
    expect(error.message).toContain('expired');
  });
});
