import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Schema contract: every column named in a PostgREST call must exist in the migrations.
 *
 * Every other suite mocks the Supabase client, so a query naming a column that does not
 * exist still passes — the mock happily returns whatever the test author wrote. That gap
 * let four separate silent failures ship at once: `entitlements.tier` (real column:
 * subscription_tier), `entitlements.image_generations_used_this_month` (real column:
 * images_used_this_month), `profiles.deletion_scheduled_at` and
 * `profiles.notification_reminders_enabled` (columns that existed in no migration at
 * all). PostgREST reports each as an ordinary query error, and the calling code
 * discarded it, so premium purchases, account deletion, the monthly quota reset and the
 * notification preferences all failed with no visible symptom.
 *
 * This test parses the migrations for the real schema and every `.from('table')` chain
 * in src/ and supabase/functions/ for the columns actually referenced, then asserts the
 * second set is contained in the first.
 */

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

/** table -> set of column names, built from CREATE TABLE and ALTER TABLE ... ADD COLUMN */
function buildSchema(): Map<string, Set<string>> {
  const schema = new Map<string, Set<string>>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

    // CREATE TABLE [IF NOT EXISTS] <name> ( ...body... );
    const createRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\n\);/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql)) !== null) {
      const table = m[1]!.toLowerCase();
      const cols = schema.get(table) ?? new Set<string>();
      for (const rawLine of m[2]!.split('\n')) {
        const line = rawLine.trim();
        // Skip table-level constraints and comments
        if (
          !line ||
          line.startsWith('--') ||
          /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|EXCLUDE)\b/i.test(line)
        ) {
          continue;
        }
        const col = /^(\w+)\s+/.exec(line);
        if (col) cols.add(col[1]!.toLowerCase());
      }
      schema.set(table, cols);
    }

    // ALTER TABLE <name> ... ADD COLUMN [IF NOT EXISTS] <col>
    const alterRe = /ALTER TABLE\s+(?:ONLY\s+)?(\w+)([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql)) !== null) {
      const table = m[1]!.toLowerCase();
      const cols = schema.get(table) ?? new Set<string>();
      const addRe = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)/gi;
      let a: RegExpExecArray | null;
      while ((a = addRe.exec(m[2]!)) !== null) cols.add(a[1]!.toLowerCase());
      if (cols.size) schema.set(table, cols);
    }
  }

  return schema;
}

function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__mocks__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full, exts));
    else if (exts.some(e => entry.endsWith(e))) out.push(full);
  }
  return out;
}

interface Reference {
  file: string;
  table: string;
  column: string;
}

/**
 * Finds `.from('<table>')` and collects the columns named in the `.select(...)`,
 * `.insert({...})`, `.update({...})` and `.eq('col', ...)` calls that follow it, up to
 * the next `.from(` or the end of the statement.
 */
function collectReferences(files: string[]): Reference[] {
  const refs: Reference[] = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const fromRe = /\.from\(\s*['"](\w+)['"]\s*\)/g;
    let m: RegExpExecArray | null;

    while ((m = fromRe.exec(src)) !== null) {
      const table = m[1]!.toLowerCase();
      // Chain extends to the next .from( or 600 chars, whichever comes first.
      const rest = src.slice(m.index + m[0].length);
      const nextFrom = rest.search(/\.from\(\s*['"]\w+['"]\s*\)/);
      const chain = rest.slice(0, nextFrom === -1 ? 600 : nextFrom);

      const add = (col: string) => {
        const c = col.trim().toLowerCase();
        if (c && /^\w+$/.test(c)) refs.push({ file, table, column: c });
      };

      // .select('a, b, c')  — ignore embedded resource syntax (col:table(...))
      const selectRe = /\.select\(\s*['"]([^'"]*)['"]/g;
      let s: RegExpExecArray | null;
      while ((s = selectRe.exec(chain)) !== null) {
        const body = s[1]!;
        if (body.trim() === '*' || body.includes('(')) continue;
        body.split(',').forEach(add);
      }

      // .eq('col', ...) / .neq / .gt / .gte / .lt / .lte / .like / .ilike / .is / .in
      const filterRe = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in)\(\s*['"](\w+)['"]/g;
      let f: RegExpExecArray | null;
      while ((f = filterRe.exec(chain)) !== null) add(f[1]!);

      // .insert({ a: ..., b: ... }) / .update({ ... }) — top-level keys of the FIRST
      // object argument only. upsert's second argument holds client options
      // (onConflict, ignoreDuplicates), which are not columns.
      const mutRe = /\.(?:insert|update|upsert)\(\s*\{/g;
      while (mutRe.exec(chain) !== null) {
        const open = mutRe.lastIndex - 1;
        let depth = 0;
        let close = -1;
        for (let i = open; i < chain.length; i++) {
          const ch = chain[i];
          if (ch === '{' || ch === '[') depth++;
          else if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0) {
              close = i;
              break;
            }
          }
        }
        if (close === -1) continue;

        const body = chain.slice(open + 1, close);
        let nested = 0;
        for (const segment of body.split('\n')) {
          const trimmed = segment.trim();
          if (nested === 0) {
            const key = /^(\w+)\s*:/.exec(trimmed);
            if (key) add(key[1]!);
          }
          nested += (segment.match(/[{[]/g) ?? []).length;
          nested -= (segment.match(/[}\]]/g) ?? []).length;
        }
      }
    }
  }

  return refs;
}

describe('Supabase schema contract', () => {
  const schema = buildSchema();
  const files = [
    ...sourceFiles(join(ROOT, 'src'), ['.ts', '.tsx']),
    ...sourceFiles(join(ROOT, 'supabase', 'functions'), ['.ts']),
  ];
  const refs = collectReferences(files);

  it('parses the migrations into a non-trivial schema', () => {
    expect(schema.get('profiles')?.size).toBeGreaterThan(5);
    expect(schema.get('entitlements')?.size).toBeGreaterThan(5);
  });

  it('finds PostgREST column references to check', () => {
    expect(refs.length).toBeGreaterThan(20);
  });

  it('references only columns that exist in the migrations', () => {
    const violations = refs
      .filter(r => schema.has(r.table))
      .filter(r => !schema.get(r.table)!.has(r.column))
      .map(r => `${r.table}.${r.column} (${r.file.replace(`${ROOT}/`, '')})`);

    expect([...new Set(violations)].sort()).toEqual([]);
  });

  it('references only tables that exist in the migrations', () => {
    const known = new Set([...schema.keys()]);
    const unknown = [...new Set(refs.map(r => r.table))].filter(t => !known.has(t)).sort();

    expect(unknown).toEqual([]);
  });

  describe('columns the app depends on', () => {
    // Regression guards for the four that shipped broken.
    it.each([
      ['entitlements', 'subscription_tier'],
      ['entitlements', 'images_used_this_month'],
      ['profiles', 'subscription_tier'],
      ['profiles', 'notification_reminders_enabled'],
      ['profiles', 'deletion_scheduled_at'],
      ['profiles', 'ai_consent_granted_at'],
      ['consent_records', 'action'],
    ])('%s.%s exists', (table, column) => {
      expect(schema.get(table)).toContain(column);
    });

    it('entitlements has no column named `tier`', () => {
      // The short name was used in four places against a schema that never had it.
      expect(schema.get('entitlements')?.has('tier')).toBe(false);
    });
  });
});
