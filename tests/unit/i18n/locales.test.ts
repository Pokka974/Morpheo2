import en from '../../../src/i18n/locales/en.json';
import fr from '../../../src/i18n/locales/fr.json';
import { initI18n, resolveDeviceLanguage, supportedLanguages } from '@i18n/index';

/**
 * Locale parity guard.
 *
 * The commonest i18n bug is a key added to one language and forgotten in the other:
 * the app then silently falls back to English for that string, which reads as a bug
 * to the user and is invisible to every other test.
 */

type Tree = Record<string, unknown>;

function flatten(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value as Tree, path)
      : [path];
  });
}

function valueAt(obj: Tree, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    return acc && typeof acc === 'object' ? (acc as Tree)[part] : undefined;
  }, obj);
}

const enKeys = flatten(en as Tree).sort();
const frKeys = flatten(fr as Tree).sort();

describe('locale files', () => {
  it('ship the same key set', () => {
    expect(frKeys).toEqual(enKeys);
  });

  it('have no empty strings', () => {
    for (const key of enKeys) {
      expect(String(valueAt(en as Tree, key)).trim()).not.toBe('');
      expect(String(valueAt(fr as Tree, key)).trim()).not.toBe('');
    }
  });

  it('use the same interpolation placeholders in both languages', () => {
    const placeholders = (s: string) => (s.match(/\{\{(\w+)\}\}/g) ?? []).sort();
    for (const key of enKeys) {
      const enValue = String(valueAt(en as Tree, key));
      const frValue = String(valueAt(fr as Tree, key));
      expect({ key, ph: placeholders(frValue) }).toEqual({
        key,
        ph: placeholders(enValue),
      });
    }
  });

  it('never leave a French string identical to its English source for real copy', () => {
    // Proper nouns and shared words are legitimately identical; anything longer than
    // a couple of words that matches exactly is almost certainly an untranslated key.
    const suspicious = enKeys.filter(key => {
      const enValue = String(valueAt(en as Tree, key));
      const frValue = String(valueAt(fr as Tree, key));
      if (enValue !== frValue) return false;
      // Format-only strings ("{{term}} · {{count}}") are correctly identical.
      const words = enValue.replace(/\{\{\w+\}\}/g, '').replace(/[^\p{L}]+/gu, ' ').trim();
      return words.split(/\s+/).filter(Boolean).length > 2;
    });
    expect(suspicious).toEqual([]);
  });
});

describe('language resolution', () => {
  it('ships English and French', () => {
    expect(supportedLanguages).toEqual(expect.arrayContaining(['en', 'fr']));
  });

  it('resolves a supported device locale', () => {
    // The test mock reports en-US.
    expect(resolveDeviceLanguage()).toBe('en');
  });

  it('initialises once and is safe to call again', () => {
    const first = initI18n('en');
    const second = initI18n('fr');
    expect(second).toBe(first);
    // The second call must not silently switch the language out from under callers.
    expect(first.language).toBe('en');
  });

  it('translates into French when asked', async () => {
    const i18n = initI18n('en');
    await i18n.changeLanguage('fr');
    expect(i18n.t('dream.interpretButton')).toBe('Interpréter ce rêve');
    await i18n.changeLanguage('en');
    expect(i18n.t('dream.interpretButton')).toBe('Interpret this dream');
  });
});
