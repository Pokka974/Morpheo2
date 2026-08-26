import { sqlite } from '@db/client';
import { deriveTitle } from '@features/journal/DreamCard';

/** Mirrors the log screen's own interpret-eligibility floor. */
const MIN_DESCRIPTION = 20;
const EXCERPT_LIMIT = 160;

export type ReadingStatus = 'ready' | 'short' | 'pending';

export interface ReadingEntry {
  dreamId: string;
  title: string;
  occurredAt: string;
  status: ReadingStatus;
  excerpt: string | null;
  keywords: string[];
  confidence: 'high' | 'medium' | 'low' | null;
}

interface ReadingRow {
  id: string;
  description: string;
  occurred_at: string;
  overall_reading: string | null;
  keywords: string | null;
  confidence: string | null;
}

function excerptOf(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function statusOf(row: ReadingRow): ReadingStatus {
  if (row.overall_reading != null) return 'ready';
  return row.description.trim().length < MIN_DESCRIPTION ? 'short' : 'pending';
}

function mapRow(row: ReadingRow): ReadingEntry {
  return {
    dreamId: row.id,
    title: deriveTitle(row.description),
    occurredAt: row.occurred_at,
    status: statusOf(row),
    excerpt: row.overall_reading ? excerptOf(row.overall_reading, EXCERPT_LIMIT) : null,
    keywords: row.keywords ? (JSON.parse(row.keywords) as string[]) : [],
    confidence: (row.confidence as ReadingEntry['confidence']) ?? null,
  };
}

/**
 * One row per dream, each carrying its latest interpretation (if any) — the data
 * behind the Lecture tab. `keyword` filters to readings whose interpretation named
 * that term; readings with no interpretation yet can never match a keyword filter,
 * which is correct; there is nothing AI-tagged on them yet.
 */
export async function getReadings(
  userId: string,
  keyword?: string,
  limit = 50
): Promise<ReadingEntry[]> {
  const keywordFilter = keyword
    ? 'AND EXISTS (SELECT 1 FROM json_each(i.keywords) je WHERE je.value = ?)'
    : '';

  const rows = await sqlite.getAllAsync<ReadingRow>(
    `SELECT d.id, d.description, d.occurred_at,
            i.overall_reading, i.keywords, i.confidence
     FROM dreams d
     LEFT JOIN interpretations i ON i.id = (
       SELECT id FROM interpretations WHERE dream_id = d.id ORDER BY created_at DESC LIMIT 1
     )
     WHERE d.user_id = ? AND d.is_deleted = 0
     ${keywordFilter}
     ORDER BY d.occurred_at DESC
     LIMIT ?`,
    keyword ? [userId, keyword, limit] : [userId, limit]
  );

  return rows.map(mapRow);
}
