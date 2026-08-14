-- Recurrence patterns: computed on-write after each interpretation INSERT
CREATE TABLE IF NOT EXISTS recurrence_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('keyword', 'emotion', 'cultural_reference')),
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol, pattern_type)
);

ALTER TABLE recurrence_patterns ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_recurrence_user ON recurrence_patterns(user_id, occurrence_count DESC);
