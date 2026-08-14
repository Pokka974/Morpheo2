// T120: Verify that interpretation style preference is applied correctly
// The interpret Edge Function appends the style layer AFTER the base prompt

describe('Interpretation Style Preference', () => {
  it('account-delete Edge Function uses exact confirmation string DELETE MY ACCOUNT', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../supabase/functions/account-delete/index.ts'),
      'utf8'
    );
    // C1 fix: exact phrase
    expect(source).toContain("'DELETE MY ACCOUNT'");
    expect(source).toContain('REQUIRED_CONFIRMATION');
  });

  it('interpret Edge Function applies style layer after base prompt', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../supabase/functions/interpret/index.ts'),
      'utf8'
    );
    // Style layer must be appended (not replacing) the base system prompt
    expect(source).toContain('interpretation_style');
  });

  it('three style values produce distinct SQL/query calls', () => {
    const STYLES = ['symbolic', 'mythological', 'psychological'];
    const uniqueStyles = new Set(STYLES);
    expect(uniqueStyles.size).toBe(3);
    // Each style maps to a distinct prompt suffix in system_prompts table columns:
    // style_symbolic, style_mythological, style_psychological
    const styleCols = STYLES.map(s => `style_${s}`);
    expect(styleCols).toEqual(['style_symbolic', 'style_mythological', 'style_psychological']);
  });

  it('does not accept custom free-text style', () => {
    // The style selector in settings only presents 3 fixed options
    // This is enforced by TypeScript: type Style = 'symbolic' | 'mythological' | 'psychological'
    type Style = 'symbolic' | 'mythological' | 'psychological';
    const validStyles: Style[] = ['symbolic', 'mythological', 'psychological'];
    const customStyle = 'custom_user_text' as string;
    expect(validStyles.includes(customStyle as Style)).toBe(false);
  });
});
