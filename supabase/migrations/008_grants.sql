-- Enable RLS on all tables (policies exist in 005 but RLS was never activated)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_patterns ENABLE ROW LEVEL SECURITY;

-- Grant table-level access to authenticated role
-- (RLS policies then restrict to own rows)
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON entitlements TO authenticated;
GRANT SELECT ON consent_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dreams TO authenticated;
GRANT SELECT, INSERT ON interpretations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON media TO authenticated;
GRANT SELECT ON recurrence_patterns TO authenticated;
