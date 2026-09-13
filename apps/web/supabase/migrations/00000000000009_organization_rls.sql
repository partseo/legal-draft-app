-- Gate 5: Organization-level Row Level Security
-- 법률사무소별 사건 데이터 격리
-- MAX_NEW_MIGRATIONS=1

-- ═══════════════════════════════════════════════════════════════
-- 1. New tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Organizations: authenticated can only see orgs they belong to
CREATE POLICY "member read own orgs" ON organizations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organizations.id AND om.user_id = auth.uid()
  ));

-- Organization members: authenticated can only see own memberships
CREATE POLICY "member read own memberships" ON organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated on org tables
-- → self-escalation blocked (tests G1, G2, G3)

-- ═══════════════════════════════════════════════════════════════
-- 2. Add organization_id to cases (nullable for backfill)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE cases ADD COLUMN organization_id uuid;

-- ═══════════════════════════════════════════════════════════════
-- 3. Deterministic backfill: 1 org per distinct created_by
-- ═══════════════════════════════════════════════════════════════

WITH distinct_creators AS (
  SELECT DISTINCT created_by FROM cases
),
ranked AS (
  SELECT created_by, row_number() OVER (ORDER BY created_by) AS rn
  FROM distinct_creators
)
INSERT INTO organizations (id, name)
SELECT
  ('b0000000-0000-0000-0000-' || lpad(rn::text, 12, '0'))::uuid,
  '법률사무소 ' || rn
FROM ranked;

WITH distinct_creators AS (
  SELECT DISTINCT created_by FROM cases
),
ranked AS (
  SELECT created_by, row_number() OVER (ORDER BY created_by) AS rn
  FROM distinct_creators
)
INSERT INTO organization_members (organization_id, user_id)
SELECT
  ('b0000000-0000-0000-0000-' || lpad(rn::text, 12, '0'))::uuid,
  created_by
FROM ranked;

UPDATE cases c
SET organization_id = om.organization_id
FROM organization_members om
WHERE c.created_by = om.user_id;

-- ═══════════════════════════════════════════════════════════════
-- 4. Enforce NOT NULL + FK
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE cases ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE cases ADD CONSTRAINT fk_cases_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- ═══════════════════════════════════════════════════════════════
-- 5. Indexes for RLS performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX idx_cases_organization_id ON cases(organization_id);

-- ═══════════════════════════════════════════════════════════════
-- 6. Drop old USING(true) policies
-- ═══════════════════════════════════════════════════════════════

DROP POLICY "team all cases" ON cases;
DROP POLICY "team all rounds" ON rounds;
DROP POLICY "team all runs" ON runs;
DROP POLICY "team all checkpoints" ON checkpoints;
DROP POLICY "team all case_files" ON case_files;
DROP POLICY "team all reviews" ON reviews;

-- Drop old storage policies
DROP POLICY "team read case-files" ON storage.objects;
DROP POLICY "team write case-files" ON storage.objects;
DROP POLICY "team update case-files" ON storage.objects;

-- ═══════════════════════════════════════════════════════════════
-- 7. New org-scoped RLS policies
-- ═══════════════════════════════════════════════════════════════

-- cases: org members only
CREATE POLICY "org cases" ON cases FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cases.organization_id
    AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = cases.organization_id
    AND om.user_id = auth.uid()
  ));

-- rounds: via cases FK path
CREATE POLICY "org rounds" ON rounds FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM cases c
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = rounds.case_id
    AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases c
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = rounds.case_id
    AND om.user_id = auth.uid()
  ));

-- runs: via rounds → cases FK path
CREATE POLICY "org runs" ON runs FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rounds rd
    JOIN cases c ON c.id = rd.case_id
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE rd.id = runs.round_id
    AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds rd
    JOIN cases c ON c.id = rd.case_id
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE rd.id = runs.round_id
    AND om.user_id = auth.uid()
  ));

-- checkpoints: via runs → rounds → cases FK path
CREATE POLICY "org checkpoints" ON checkpoints FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM runs rn
    JOIN rounds rd ON rd.id = rn.round_id
    JOIN cases c ON c.id = rd.case_id
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE rn.id = checkpoints.run_id
    AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM runs rn
    JOIN rounds rd ON rd.id = rn.round_id
    JOIN cases c ON c.id = rd.case_id
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE rn.id = checkpoints.run_id
    AND om.user_id = auth.uid()
  ));

-- case_files: via cases FK path
CREATE POLICY "org case_files" ON case_files FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM cases c
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = case_files.case_id
    AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases c
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = case_files.case_id
    AND om.user_id = auth.uid()
  ));

-- reviews: via rounds → cases FK path
CREATE POLICY "org reviews" ON reviews FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rounds rd
    JOIN cases c ON c.id = rd.case_id
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE rd.id = reviews.round_id
    AND om.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rounds rd
    JOIN cases c ON c.id = rd.case_id
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE rd.id = reviews.round_id
    AND om.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════
-- 8. Storage: org-scoped policies (bucket case-files)
--    Path format: {caseId}/filename
-- ═══════════════════════════════════════════════════════════════

CREATE POLICY "org read case-files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-files'
    AND EXISTS (
      SELECT 1 FROM cases c
      JOIN organization_members om ON om.organization_id = c.organization_id
      WHERE c.id = (split_part(name, '/', 1))::uuid
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "org write case-files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-files'
    AND EXISTS (
      SELECT 1 FROM cases c
      JOIN organization_members om ON om.organization_id = c.organization_id
      WHERE c.id = (split_part(name, '/', 1))::uuid
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "org update case-files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'case-files'
    AND EXISTS (
      SELECT 1 FROM cases c
      JOIN organization_members om ON om.organization_id = c.organization_id
      WHERE c.id = (split_part(name, '/', 1))::uuid
      AND om.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 9. Compatibility trigger: auto-assign organization_id on INSERT
--    when not specified (preserves existing createCase flow)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assign_case_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  _org_id uuid;
  _count int;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _count
  FROM public.organization_members
  WHERE user_id = auth.uid();

  IF _count = 0 THEN
    RAISE EXCEPTION 'User % belongs to no organization', auth.uid();
  END IF;

  IF _count > 1 THEN
    RAISE EXCEPTION 'User % belongs to multiple organizations; specify organization_id explicitly', auth.uid();
  END IF;

  SELECT organization_id INTO _org_id
  FROM public.organization_members
  WHERE user_id = auth.uid();

  NEW.organization_id := _org_id;
  RETURN NEW;
END $$;

CREATE TRIGGER cases_assign_org
  BEFORE INSERT ON cases
  FOR EACH ROW
  EXECUTE FUNCTION assign_case_organization();
