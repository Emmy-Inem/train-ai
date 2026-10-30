-- Keep legacy individual assignments visible without broadening their recipients.
-- assignment_scope preserves historical records rather than deleting curriculum rows.
alter table public.cohort_courses add column if not exists assignment_scope text not null default 'cohort'
  check (assignment_scope in ('cohort','individuals'));
update public.cohort_courses cc set assignment_scope='individuals'
where exists(select 1 from public.cohort_learner_courses a where a.cohort_id=cc.cohort_id and a.course_id=cc.course_id)
  and exists(select 1 from public.cohort_members m where m.cohort_id=cc.cohort_id and not exists(
    select 1 from public.cohort_learner_courses a where a.cohort_id=cc.cohort_id and a.course_id=cc.course_id and a.user_id=m.user_id));

-- Migration: 202610280001_fix_individual_cohort_assignment.sql
-- Fixes assign_course_to_cohort_members so that courses assigned with individual
-- scope (p_assign_all = false) do NOT pollute cohort_courses (the entire cohort's curriculum).

create or replace function public.assign_course_to_cohort_members(
  p_cohort_id uuid,
  p_course_id uuid,
  p_user_ids uuid[] default null,
  p_assign_all boolean default false,
  p_due_at date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_user_ids uuid[] := array[]::uuid[];
  v_requested_count integer := 0;
  v_assigned_count integer := 0;
  v_new_assignment_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select c.organization_id into v_organization_id
  from public.cohorts c
  where c.id = p_cohort_id;

  if v_organization_id is null then
    raise exception 'Cohort not found';
  end if;

  if not (
    public.is_super_admin(auth.uid())
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = v_organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and om.role::text in ('owner', 'admin', 'people_manager')
    )
  ) then
    raise exception 'Not authorized to assign courses for this cohort' using errcode = '42501';
  end if;

  if not exists (select 1 from public.courses c where c.id = p_course_id and (c.organization_id is null or c.organization_id = v_organization_id)) then
    raise exception 'Course not found';
  end if;

  if p_assign_all then
    select coalesce(array_agg(distinct cm.user_id), array[]::uuid[])
    into v_user_ids
    from public.cohort_members cm
    where cm.cohort_id = p_cohort_id;
  else
    select count(distinct requested_id)
    into v_requested_count
    from unnest(coalesce(p_user_ids, array[]::uuid[])) requested_id;

    select coalesce(array_agg(distinct cm.user_id), array[]::uuid[])
    into v_user_ids
    from public.cohort_members cm
    join unnest(coalesce(p_user_ids, array[]::uuid[])) requested_id
      on requested_id = cm.user_id
    where cm.cohort_id = p_cohort_id;

    if cardinality(v_user_ids) <> v_requested_count then
      raise exception 'One or more selected learners do not belong to this cohort';
    end if;
  end if;

  v_assigned_count := cardinality(v_user_ids);
  if v_assigned_count = 0 then
    raise exception 'Select at least one learner before assigning this course';
  end if;

  -- CRITICAL FIX: Only insert into cohort_courses (the cohort-wide curriculum)
  -- when assigning to the entire cohort. Individual-scoped assignments must NOT
  -- pollute cohort_courses, otherwise every cohort member sees them on their Courses tab.
  if p_assign_all then
    insert into public.cohort_courses (cohort_id, course_id, due_at, assignment_scope)
    values (p_cohort_id, p_course_id, p_due_at, 'cohort')
    on conflict (cohort_id, course_id) do update
      set due_at = excluded.due_at, assignment_scope = 'cohort';
  end if;

  with inserted as (
    insert into public.cohort_learner_courses (
      cohort_id,
      course_id,
      user_id,
      assigned_by
    )
    select p_cohort_id, p_course_id, selected_user_id, auth.uid()
    from unnest(v_user_ids) selected_user_id
    where not exists (
      select 1
      from public.cohort_learner_courses existing
      where existing.cohort_id = p_cohort_id
        and existing.course_id = p_course_id
        and existing.user_id = selected_user_id
    )
    returning id
  )
  select count(*) into v_new_assignment_count from inserted;

  insert into public.course_enrollments (
    user_id,
    course_id,
    enrolled_at,
    progress_percentage
  )
  select selected_user_id, p_course_id, now(), 0
  from unnest(v_user_ids) selected_user_id
  on conflict (user_id, course_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'assigned_count', v_assigned_count,
    'new_assignment_count', v_new_assignment_count,
    'scope', case when p_assign_all then 'cohort' else 'individuals' end
  );
end;
$$;

revoke all on function public.assign_course_to_cohort_members(uuid, uuid, uuid[], boolean, date) from public, anon;
grant execute on function public.assign_course_to_cohort_members(uuid, uuid, uuid[], boolean, date) to authenticated, service_role;

comment on function public.assign_course_to_cohort_members(uuid, uuid, uuid[], boolean, date) is
  'Atomically assigns one course to every learner in a cohort (cohort scope) or to selected learners (individual scope). Only cohort scope adds to cohort_courses.';

-- Every assignment path (including individual/track admin forms) creates an enrollment.
-- DO NOTHING is essential: assigning an existing course must preserve learner progress.
create or replace function public.enroll_cohort_assignment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.course_enrollments(user_id,course_id,enrolled_at,progress_percentage)
  values(new.user_id,new.course_id,now(),0) on conflict(user_id,course_id) do nothing;
  return new;
end; $$;
create trigger enroll_cohort_assignment after insert on public.cohort_learner_courses
for each row execute function public.enroll_cohort_assignment();

create or replace function public.enroll_shared_cohort_curriculum() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='cohort_members' then
    insert into public.course_enrollments(user_id,course_id,enrolled_at,progress_percentage)
    select new.user_id,cc.course_id,now(),0 from public.cohort_courses cc
    where cc.cohort_id=new.cohort_id and cc.assignment_scope='cohort'
    on conflict(user_id,course_id) do nothing;
  elsif new.assignment_scope='cohort' then
    insert into public.course_enrollments(user_id,course_id,enrolled_at,progress_percentage)
    select m.user_id,new.course_id,now(),0 from public.cohort_members m where m.cohort_id=new.cohort_id
    on conflict(user_id,course_id) do nothing;
  end if;
  return new;
end; $$;
create trigger enroll_new_cohort_member after insert on public.cohort_members
for each row execute function public.enroll_shared_cohort_curriculum();
create trigger enroll_shared_cohort_course after insert or update of assignment_scope on public.cohort_courses
for each row execute function public.enroll_shared_cohort_curriculum();
revoke all on function public.enroll_cohort_assignment(),public.enroll_shared_cohort_curriculum() from public,anon,authenticated;

insert into public.course_enrollments(user_id,course_id,enrolled_at,progress_percentage)
select a.user_id,a.course_id,now(),0 from public.cohort_learner_courses a
union select m.user_id,cc.course_id,now(),0 from public.cohort_courses cc join public.cohort_members m using(cohort_id)
where cc.assignment_scope='cohort'
on conflict(user_id,course_id) do nothing;
notify pgrst,'reload schema';
