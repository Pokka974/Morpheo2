import { useState, useCallback, useRef } from 'react';
import { db } from '@db/client';
import { sql } from 'drizzle-orm';

export interface SearchResult {
  id: string;
  description: string;
  occurredAt: string;
  syncStatus: string;
}

export function useJournalSearch() {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!query.trim()) {
      setResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimer.current = setTimeout(() => {
      try {
        const like = `%${query}%`;
        // Search description + interpretation keywords (left join)
        const rows = db.all(sql`
          SELECT DISTINCT d.id, d.description, d.occurred_at as occurredAt, d.sync_status as syncStatus
          FROM dreams d
          LEFT JOIN interpretations i ON i.dream_id = d.id
          WHERE d.is_deleted = 0
            AND (
              d.description LIKE ${like}
              OR i.keywords LIKE ${like}
            )
          ORDER BY d.occurred_at DESC
          LIMIT 50
        `);
        setResults(rows as unknown as SearchResult[]);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setResults(null);
    setIsSearching(false);
  }, []);

  return { results, isSearching, search, clearSearch };
}
