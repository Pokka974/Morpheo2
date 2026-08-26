import { ordinal } from '@shared/ordinal';

describe('ordinal', () => {
  describe('French', () => {
    it('uses the masculine "1ᵉʳ" for one', () => {
      expect(ordinal(1, 'fr')).toBe('1ᵉʳ');
    });

    it('uses the plain "ᵉ" suffix for everything else', () => {
      expect(ordinal(2, 'fr')).toBe('2ᵉ');
      expect(ordinal(11, 'fr')).toBe('11ᵉ');
      expect(ordinal(21, 'fr')).toBe('21ᵉ');
    });
  });

  describe('English', () => {
    it('suffixes st/nd/rd for 1, 2 and 3', () => {
      expect(ordinal(1, 'en')).toBe('1st');
      expect(ordinal(2, 'en')).toBe('2nd');
      expect(ordinal(3, 'en')).toBe('3rd');
    });

    it('falls back to "th" for 4 through 10', () => {
      expect(ordinal(4, 'en')).toBe('4th');
      expect(ordinal(9, 'en')).toBe('9th');
      expect(ordinal(10, 'en')).toBe('10th');
    });

    // The teens are the whole reason this is not a bare `n % 10` switch: 11/12/13
    // would otherwise read "11st"/"12nd"/"13rd".
    it('treats the teens as "th" despite their final digit', () => {
      expect(ordinal(11, 'en')).toBe('11th');
      expect(ordinal(12, 'en')).toBe('12th');
      expect(ordinal(13, 'en')).toBe('13th');
    });

    it('resumes st/nd/rd past the teens', () => {
      expect(ordinal(21, 'en')).toBe('21st');
      expect(ordinal(22, 'en')).toBe('22nd');
      expect(ordinal(23, 'en')).toBe('23rd');
      expect(ordinal(24, 'en')).toBe('24th');
    });

    // A month can't reach 111, but the rem100 guard is what makes that safe rather
    // than accidental — pin it so a "simplification" to `n < 20` doesn't slip through.
    it('applies the teens rule to every century', () => {
      expect(ordinal(111, 'en')).toBe('111th');
      expect(ordinal(112, 'en')).toBe('112th');
      expect(ordinal(121, 'en')).toBe('121st');
    });
  });
});
