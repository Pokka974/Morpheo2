import { useState, useCallback } from 'react';
import { sqlite } from '@db/client';

export interface JournalFilters {
  emotion?: string;
  startDate?: string;
  endDate?: string;
}

export interface FilterResult {
  id: string;
  description: string;
  occurredAt: string;
  syncStatus: string;
}

export function useJournalFilters() {
  const [filters, setFilters] = useState<JournalFilters>({});
  const [results, setResults] = useState<FilterResult[] | null>(null);
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
          EXISTS (SELECT 1 FROM json_each(i.emotions) je WHERE je.value = ?)
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
      const query = `
        SELECT DISTINCT d.id, d.description, d.occurred_at as occurredAt, d.sync_status as syncStatus
        FROM dreams d
        LEFT JOIN interpretations i ON i.dream_id = d.id
        WHERE ${whereClause}
        -- Tie-break on logged_at: occurred_at is date-only, so same-night dreams
        -- would otherwise come back in arbitrary order.
        ORDER BY d.occurred_at DESC, d.logged_at DESC
        LIMIT 100
      `;

      const stmt = sqlite.prepareSync(query);
      const rows = Array.from(stmt.executeSync(bindings)) as unknown as FilterResult[];
      setResults(rows);
    } catch {
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
