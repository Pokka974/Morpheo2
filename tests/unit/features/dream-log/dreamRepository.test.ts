import { validateForInterpretation } from '@features/dream-log/dreamRepository';

// SQLite operations are tested via integration tests (require a real DB).
// Unit tests cover pure logic: validation, error conditions.

describe('dreamRepository', () => {
  describe('validateForInterpretation', () => {
    it('throws for descriptions shorter than 20 chars', () => {
      expect(() => validateForInterpretation('Short dream')).toThrow(/20 characters/);
    });

    it('throws for empty description', () => {
      expect(() => validateForInterpretation('')).toThrow(/20 characters/);
    });

    it('throws for whitespace-only description', () => {
      expect(() => validateForInterpretation('   ')).toThrow(/20 characters/);
    });

    it('passes for descriptions of exactly 20 characters', () => {
      expect(() => validateForInterpretation('12345678901234567890')).not.toThrow();
    });

    it('passes for long, rich descriptions', () => {
      const description = 'I was walking through a forest and suddenly saw a large bridge over water.';
      expect(() => validateForInterpretation(description)).not.toThrow();
    });
  });
});
