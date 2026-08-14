-- Profiles: one per auth.users row, created by trigger
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_reminder_time TIME,
  interpretation_style TEXT NOT NULL DEFAULT 'symbolic' CHECK (interpretation_style IN ('symbolic', 'mythological', 'psychological')),
  ai_consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
  ai_consent_granted_at TIMESTAMPTZ,
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Entitlements: one per user, managed by service role + RevenueCat webhook
CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  interpretations_used_this_month INTEGER NOT NULL DEFAULT 0,
  monthly_interpretation_limit INTEGER DEFAULT 5,
  images_used_this_month INTEGER NOT NULL DEFAULT 0,
  monthly_image_limit INTEGER DEFAULT 5,
  reset_date DATE NOT NULL DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
  subscription_expires_at TIMESTAMPTZ,
  revenuecat_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consent records: append-only audit log
CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('granted', 'revoked')),
  ip_address TEXT,
  user_agent TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
