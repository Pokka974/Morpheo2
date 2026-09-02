import { useState, useCallback, useRef } from 'react';
import { sqlite } from '@db/client';
import type { JournalEntry } from './DreamCard';
import {
  JOURNAL_ENTRY_COLUMNS,
  JOURNAL_ENTRY_JOINS,
  JOURNAL_ENTRY_ORDER,
  JOURNAL_ENTRY_SCOPE,
  mapJournalEntryRow,
  type JournalEntryRow,
} from './journalEntryQuery';

/** `userId` is null only while the session is still resolving — the list is showing
 * its loading state then, so the search field isn't reachable yet. */
export function useJournalSearch(userId: string | null) {
  const [results, setResults] = useState<JournalEntry[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (query: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      if (!query.trim() || !userId) {
        setResults(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      debounceTimer.current = setTimeout(() => {
        try {
          const like = `%${query}%`;
          // Matching joins `interpretations` a second time, as `si`: the card's own `i`
          // join is pinned to the *newest* interpretation, which would silently narrow
          // what a keyword search can find on a dream that has more than one.
          const stmt = sqlite.prepareSync(`
          SELECT DISTINCT ${JOURNAL_ENTRY_COLUMNS}
          FROM dreams d
          ${JOURNAL_ENTRY_JOINS}
          LEFT JOIN interpretations si ON si.dream_id = d.id
          WHERE ${JOURNAL_ENTRY_SCOPE}
            AND (
              d.description LIKE ?
              OR si.keywords LIKE ?
            )
          ${JOURNAL_ENTRY_ORDER}
          LIMIT 50
        `);
          // Finalized explicitly: this runs on every debounced keystroke, and a prepared
          // statement that is never finalized holds its SQLite resources for the life of
          // the process.
          let rows: JournalEntryRow[];
          try {
            rows = Array.from(
              stmt.executeSync([userId, like, like])
            ) as unknown as JournalEntryRow[];
          } finally {
            stmt.finalizeSync();
          }
          setResults(rows.map(mapJournalEntryRow));
        } catch (err) {
          console.error('Journal search failed:', err);
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [userId]
  );

  const clearSearch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setResults(null);
    setIsSearching(false);
  }, []);

  return { results, isSearching, search, clearSearch };
}
