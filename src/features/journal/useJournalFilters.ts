import { useState, useCallback } from 'react';
import { sqlite } from '@db/client';
import type { JournalEntry } from './DreamCard';
import {
  JOURNAL_ENTRY_COLUMNS,
  JOURNAL_ENTRY_JOINS,
  JOURNAL_ENTRY_ORDER,
  mapJournalEntryRow,
  type JournalEntryRow,
} from './journalEntryQuery';

export interface JournalFilters {
  emotion?: string;
  startDate?: string;
  endDate?: string;
}

export function useJournalFilters() {
  const [filters, setFilters] = useState<JournalFilters>({});
  const [results, setResults] = useState<JournalEntry[] | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);

  const applyFilters = useCallback((newFilters: JournalFilters) => {
    setFilters(newFilters);
    const hasFilters = newFilters.emotion || newFilters.startDate || newFilters.endDate;

    if (!hasFilters) {
      setResults(null);
      return;
    }

    setIsFiltering(true);
    try {
      // Build WHERE clauses compatible with SQLite (NOT PostgreSQL array operators)
      const conditions: string[] = ['d.is_deleted = 0'];
      const bindings: (string | number | null)[] = [];

      if (newFilters.emotion) {
        // SQLite json_each subquery for JSON array emotion filtering (H2 fix).
        // Matches either list: the dreamer's own emotions from the log screen, or the
        // AI's reading — filtering on "fear" must not skip a dream the dreamer
        // themselves tagged as frightening just because it has no interpretation yet.
        conditions.push(`(
          EXISTS (SELECT 1 FROM json_each(fi.emotions) je WHERE je.value = ?)
          OR EXISTS (SELECT 1 FROM json_each(d.emotions) de WHERE de.value = ?)
        )`);
        bindings.push(newFilters.emotion, newFilters.emotion);
      }

      if (newFilters.startDate) {
        conditions.push('d.occurred_at >= ?');
        bindings.push(newFilters.startDate);
      }

      if (newFilters.endDate) {
        conditions.push('d.occurred_at <= ?');
        bindings.push(newFilters.endDate);
      }

      const whereClause = conditions.join(' AND ');
      // Emotion matching joins `interpretations` a second time, as `fi`: the card's
      // own `i` join is pinned to the *newest* interpretation, which would silently
      // narrow what an emotion filter can match on a dream that has more than one.
      const query = `
        SELECT DISTINCT ${JOURNAL_ENTRY_COLUMNS}
        FROM dreams d
        ${JOURNAL_ENTRY_JOINS}
        LEFT JOIN interpretations fi ON fi.dream_id = d.id
        WHERE ${whereClause}
        ${JOURNAL_ENTRY_ORDER}
        LIMIT 100
      `;

      const stmt = sqlite.prepareSync(query);
      // Finalized explicitly — an unfinalized prepared statement holds its SQLite
      // resources for the life of the process.
      let rows: JournalEntryRow[];
      try {
        rows = Array.from(stmt.executeSync(bindings)) as unknown as JournalEntryRow[];
      } finally {
        stmt.finalizeSync();
      }
      setResults(rows.map(mapJournalEntryRow));
    } catch (err) {
      console.error('Journal filter failed:', err);
      setResults([]);
    } finally {
      setIsFiltering(false);
    }
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setResults(null);
  }, []);

  return { filters, results, isFiltering, applyFilters, clearFilters };
}
