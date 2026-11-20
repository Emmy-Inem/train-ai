-- ============================================================================
-- Migration: Remove demo, seeded, and testing artifacts & stock avatars
-- Ensures genuine production user profiles and real @gmail.com accounts are surfaced.
-- ============================================================================

-- 1. Remove stock photos and demo avatar URLs from user_profiles
UPDATE public.user_profiles
SET avatar_url = NULL
WHERE avatar_url ILIKE '%unsplash.com%'
   OR avatar_url ILIKE '%pexels.com%'
   OR avatar_url ILIKE '%pravatar.cc%'
   OR avatar_url ILIKE '%randomuser.me%'
   OR avatar_url ILIKE '%picsum.photos%'
   OR avatar_url ILIKE '%ui-avatars.com%'
   OR avatar_url ILIKE '%dicebear.com%';

-- 2. Remove stock banners from cohorts if any
UPDATE public.cohorts
SET banner_url = NULL
WHERE banner_url ILIKE '%unsplash.com%'
   OR banner_url ILIKE '%pexels.com%';

-- 3. Remove demo organization and associated demo data
DO $$
DECLARE
  v_demo_org_id uuid := 'd0000000-0000-0000-0000-000000000001';
BEGIN
  -- Delete dependent records for demo org or demo UUID prefixes
  DELETE FROM public.cohort_members
  WHERE cohort_id IN (SELECT id FROM public.cohorts WHERE organization_id = v_demo_org_id)
     OR user_id IN (
       'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003',
       'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005',
       'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000007',
       'd0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000011',
       'd0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000013',
       'd0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000015',
       'd0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000017'
     );

  DELETE FROM public.cohort_courses
  WHERE cohort_id IN (SELECT id FROM public.cohorts WHERE organization_id = v_demo_org_id);

  DELETE FROM public.course_enrollments
  WHERE user_id IN (
    'd0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000011',
    'd0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000013',
    'd0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000015',
    'd0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000017'
  );

  DELETE FROM public.cohorts WHERE organization_id = v_demo_org_id OR id = 'd0000000-0000-0000-0000-000000000030';
  DELETE FROM public.courses WHERE organization_id = v_demo_org_id;

  DELETE FROM public.organization_members
  WHERE organization_id = v_demo_org_id
     OR user_id IN (
       'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003',
       'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005',
       'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000007',
       'd0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000011',
       'd0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000013',
       'd0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000015',
       'd0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000017'
     );

  DELETE FROM public.user_profiles
  WHERE id IN (
    'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003',
    'd0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005',
    'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000007',
    'd0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000011',
    'd0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000013',
    'd0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000015',
    'd0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000017'
  );

  DELETE FROM public.organizations WHERE id = v_demo_org_id OR slug = 'demo-academy-sample';

  -- Clean up QA test organizations created during testing
  DELETE FROM public.organizations WHERE name ILIKE 'TRAINAI_QA_%';
END $$;
