/**
 * "4th"/"4ᵉ" — used for the dream detail screen's "Nth {theme} dream this month"
 * header. i18next's plural-suffix system (`_other`) isn't the right tool for ordinals,
 * so this is called with a pre-formatted string passed as the translation's
 * interpolation value rather than relying on pluralization rules.
 */
export function ordinal(n: number, locale: 'en' | 'fr'): string {
  if (locale === 'fr') return n === 1 ? '1ᵉʳ' : `${n}ᵉ`;

  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
