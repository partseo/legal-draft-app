-- CASE-10000 감사용 합성 코퍼스 (deterministic)
-- 출처: CASE-10000-CORPUS-MANIFEST.json
-- profiles 50, cases 10K, rounds 30K, runs 120K, reviews 60K, case_files 81K

-- ========== 1. auth.users + profiles (trigger creates profiles) ==========
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_user_meta_data)
SELECT
  ('a0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  '합성사용자_' || lpad(i::text, 6, '0') || '@test.local',
  '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012',
  now(),
  now() - interval '1 day' * (50 - i),
  now(),
  '',
  jsonb_build_object('display_name', '합성사용자_' || lpad(i::text, 6, '0'))
FROM generate_series(1, 50) AS i;

-- ========== 1b. organizations (1 per user, deterministic UUID) ==========
INSERT INTO organizations (id, name, created_at)
SELECT
  ('b0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  '법률사무소 ' || i,
  now()
FROM generate_series(1, 50) AS i;

-- ========== 1c. organization_members (link each user to their org) ==========
INSERT INTO organization_members (organization_id, user_id, created_at)
SELECT
  ('b0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  ('a0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  now()
FROM generate_series(1, 50) AS i;

-- ========== 2. cases 10,000 ==========
DO $$
DECLARE
  names text[] := ARRAY['홍길동','김민수','이영희','박서준','최수정','정하늘','강동원','윤서연','배수진','조현우',
                        '한소희','오지호','신동혁','류하은','문재영','임채원','장서윤','권도현','허지민','송태양'];
  types text[] := ARRAY['해고무효확인','통상임금','양수금','가압류이의','명예훼손','임금체불','부당해고','손해배상','대여금','보증금반환',
                        '소유권이전','매매대금','약정금','구상금','채무부존재','물품대금','건물명도','퇴직금','위약금','용역대금'];
  statuses text[] := ARRAY['대기','대기','대기','대기','대기','대기','진행','진행','진행','완료','보관']; -- 대기60% 진행25% 완료10% 보관5% approx
  uid uuid;
  org_id uuid;
  case_status text;
  am author_mode;
BEGIN
  FOR i IN 1..10000 LOOP
    uid := ('a0000000-0000-0000-0000-' || lpad(((i % 50) + 1)::text, 12, '0'))::uuid;
    org_id := ('b0000000-0000-0000-0000-' || lpad(((i % 50) + 1)::text, 12, '0'))::uuid;
    IF i <= 6000 THEN case_status := '대기';
    ELSIF i <= 8500 THEN case_status := '진행';
    ELSIF i <= 9500 THEN case_status := '완료';
    ELSE case_status := '보관';
    END IF;
    IF i % 7 = 0 THEN am := 'judicial_scrivener'; ELSE am := 'lawyer'; END IF;
    INSERT INTO cases (id, title, status, assignee, created_by, created_at, updated_at, author_mode, organization_id)
    VALUES (
      ('c' || lpad(i::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
      names[(i % 20) + 1] || '_' || lpad(i::text, 6, '0') || ' ' || types[(i % 20) + 1],
      case_status,
      uid,
      uid,
      now() - CASE WHEN i <= 2000 THEN interval '1 day' * (i % 30)
                   WHEN i <= 7000 THEN interval '30 days' + interval '1 day' * ((i - 2000) % 335)
                   ELSE interval '365 days' + interval '1 day' * ((i - 7000) % 365)
              END,
      now(),
      am,
      org_id
    );
  END LOOP;
END $$;

-- ========== 3. rounds 30,000 (3 per case) ==========
DO $$
DECLARE
  kinds round_kind[] := ARRAY['소장'::round_kind, '준비서면'::round_kind, '소장'::round_kind];
BEGIN
  FOR i IN 1..10000 LOOP
    FOR s IN 1..3 LOOP
      INSERT INTO rounds (id, case_id, kind, seq, created_at)
      VALUES (
        ('d' || lpad(((i - 1) * 3 + s)::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        ('c' || lpad(i::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        kinds[s],
        s,
        now() - interval '1 hour' * ((10000 - i) * 3 + (3 - s))
      );
    END LOOP;
  END LOOP;
END $$;

-- ========== 4. runs 120,000 (4 per round) ==========
DO $$
DECLARE
  stages run_stage[] := ARRAY['intake'::run_stage, 'research'::run_stage, 'draft'::run_stage, 'verify'::run_stage];
  st run_status;
  uid uuid;
BEGIN
  FOR r IN 1..30000 LOOP
    uid := ('a0000000-0000-0000-0000-' || lpad(((r % 50) + 1)::text, 12, '0'))::uuid;
    FOR s IN 1..4 LOOP
      DECLARE
        n int := (r - 1) * 4 + s;
        pct int := n % 10;
      BEGIN
        IF pct < 7 THEN st := 'succeeded';
        ELSIF pct = 7 THEN st := 'running';
        ELSIF pct = 8 THEN st := 'canceled';
        ELSE st := 'failed';
        END IF;
        INSERT INTO runs (id, round_id, stage, status, started_by, started_at, finished_at, input_tokens, output_tokens, cost_usd)
        VALUES (
          ('e' || lpad(n::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
          ('d' || lpad(r::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
          stages[s],
          st,
          uid,
          now() - interval '1 minute' * (120000 - n),
          CASE WHEN st IN ('succeeded','failed','canceled') THEN now() - interval '1 minute' * (120000 - n) + interval '30 seconds' ELSE NULL END,
          (n % 5000 + 500),
          (n % 3000 + 200),
          round((n % 500 + 10)::numeric / 100, 4)
        );
      END;
    END LOOP;
  END LOOP;
END $$;

-- ========== 5. reviews 60,000 (2 per round) ==========
DO $$
DECLARE
  decisions review_decision[] := ARRAY['승인'::review_decision, '수정지시'::review_decision];
  stg run_stage[] := ARRAY['draft'::run_stage, 'verify'::run_stage];
  uid uuid;
BEGIN
  FOR r IN 1..30000 LOOP
    uid := ('a0000000-0000-0000-0000-' || lpad(((r % 50) + 1)::text, 12, '0'))::uuid;
    FOR v IN 1..2 LOOP
      INSERT INTO reviews (id, round_id, stage, decision, note, reviewer, created_at)
      VALUES (
        ('f' || lpad(((r - 1) * 2 + v)::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        ('d' || lpad(r::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        stg[v],
        decisions[(v % 2) + 1],
        '합성리뷰_' || lpad(((r - 1) * 2 + v)::text, 6, '0'),
        uid,
        now() - interval '1 minute' * (60000 - ((r - 1) * 2 + v))
      );
    END LOOP;
  END LOOP;
END $$;

-- ========== 6. case_files 81,000 ==========
-- 기본 8 files per case (10K * 8 = 80K) + 추가 100 for top 10 cases (10 * 100 = 1K) = 81K
DO $$
DECLARE
  kinds file_kind[] := ARRAY['입력'::file_kind, '사건컨텍스트'::file_kind, '리서치'::file_kind, '서면'::file_kind,
                             '검증보고'::file_kind, 'context_json'::file_kind, '입력'::file_kind, '서면'::file_kind];
  uid uuid;
  f int := 0;
BEGIN
  FOR i IN 1..10000 LOOP
    uid := ('a0000000-0000-0000-0000-' || lpad(((i % 50) + 1)::text, 12, '0'))::uuid;
    FOR k IN 1..8 LOOP
      f := f + 1;
      INSERT INTO case_files (id, case_id, kind, filename, storage_path, uploaded_by, created_at)
      VALUES (
        ('b' || lpad(f::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        ('c' || lpad(i::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        kinds[k],
        '합성파일_' || lpad(f::text, 6, '0') || '.docx',
        'case-files/c' || lpad(i::text, 7, '0') || '/합성파일_' || lpad(f::text, 6, '0') || '.docx',
        uid,
        now() - interval '1 hour' * (81000 - f)
      );
    END LOOP;
  END LOOP;
  -- heavy cases: top 10 get 100 extra each
  FOR i IN 1..10 LOOP
    uid := ('a0000000-0000-0000-0000-' || lpad(((i % 50) + 1)::text, 12, '0'))::uuid;
    FOR k IN 1..100 LOOP
      f := f + 1;
      INSERT INTO case_files (id, case_id, kind, filename, storage_path, uploaded_by, created_at)
      VALUES (
        ('b' || lpad(f::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        ('c' || lpad(i::text, 7, '0') || '-0000-0000-0000-000000000000')::uuid,
        kinds[(k % 8) + 1],
        '합성파일_' || lpad(f::text, 6, '0') || '.docx',
        'case-files/c' || lpad(i::text, 7, '0') || '/합성파일_' || lpad(f::text, 6, '0') || '.docx',
        uid,
        now() - interval '1 minute' * (1000 - k)
      );
    END LOOP;
  END LOOP;
END $$;
