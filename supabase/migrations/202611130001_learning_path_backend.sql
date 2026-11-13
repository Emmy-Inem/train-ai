-- Learning pathways: atomic administration and tenant-scoped assignment.
-- Learners retain row-level access to their own learning_path_enrollments;
-- administrators use these narrow functions for assignment and counts.

create or replace function public.can_manage_learning_path(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      public.is_super_admin(auth.uid())
      or (
        p_organization_id is not null
        and public.effective_has_permission(auth.uid(), 'manage_courses')
        and p_organization_id = public.get_user_organization_id(auth.uid())
      )
    );
$$;

revoke all on function public.can_manage_learning_path(uuid) from public, anon;
grant execute on function public.can_manage_learning_path(uuid) to authenticated;

create or replace function public.save_learning_path(
  p_path_id uuid,
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_level text,
  p_category text,
  p_course_ids uuid[],
  p_is_published boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path_id uuid := p_path_id;
  v_existing_org_id uuid;
  v_course_ids uuid[] := coalesce(p_course_ids, '{}'::uuid[]);
  v_distinct_count integer;
  v_total_count integer;
begin
  if auth.uid() is null or not public.can_manage_learning_path(p_organization_id) then
    raise exception 'You do not have permission to manage learning paths for this organization.' using errcode = '42501';
  end if;
  if nullif(btrim(p_title), '') is null then
    raise exception 'A learning path title is required.' using errcode = '22023';
  end if;
  if p_organization_id is not null and not exists (
    select 1 from public.organizations o where o.id = p_organization_id
  ) then
    raise exception 'The selected organization could not be found.' using errcode = '22023';
  end if;

  select count(*), count(distinct course_id)
    into v_total_count, v_distinct_count
    from unnest(v_course_ids) as selected(course_id);
  if v_total_count <> v_distinct_count then
    raise exception 'A course can only appear once in a learning path.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_course_ids) as selected(course_id)
    where not exists (select 1 from public.courses c where c.id = selected.course_id)
  ) then
    raise exception 'One or more selected courses could not be found.' using errcode = '22023';
  end if;
  if coalesce(p_is_published, false) and cardinality(v_course_ids) = 0 then
    raise exception 'Add at least one course before publishing this path.' using errcode = '22023';
  end if;
  if coalesce(p_is_published, false) and exists (
    select 1
    from unnest(v_course_ids) as selected(course_id)
    join public.courses c on c.id = selected.course_id
    where not c.is_published or c.archived_at is not null
  ) then
    raise exception 'Publish every course in this path before publishing the path.' using errcode = '22023';
  end if;

  if v_path_id is null then
    insert into public.learning_paths (title, description, level_label, category, organization_id, created_by, is_published)
    values (
      btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
      coalesce(nullif(btrim(p_level), ''), 'beginner'), nullif(btrim(coalesce(p_category, '')), ''),
      p_organization_id, auth.uid(), coalesce(p_is_published, false)
    )
    returning id into v_path_id;
  else
    select organization_id into v_existing_org_id
    from public.learning_paths where id = v_path_id for update;
    if not found then
      raise exception 'Learning path not found.' using errcode = 'P0002';
    end if;
    if v_existing_org_id is distinct from p_organization_id then
      raise exception 'The selected learning path belongs to a different organization.' using errcode = '42501';
    end if;
    update public.learning_paths
    set title = btrim(p_title),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        level_label = coalesce(nullif(btrim(p_level), ''), 'beginner'),
        category = nullif(btrim(coalesce(p_category, '')), ''),
        is_published = coalesce(p_is_published, false)
    where id = v_path_id;
  end if;

  delete from public.learning_path_courses pc
  where pc.path_id = v_path_id
    and not (pc.course_id = any(v_course_ids));

  with desired as (
    select selected.course_id, (selected.position - 1)::integer as order_index
    from unnest(v_course_ids) with ordinality as selected(course_id, position)
  )
  update public.learning_path_courses pc
  set order_index = desired.order_index
  from desired
  where pc.path_id = v_path_id and pc.course_id = desired.course_id;

  with desired as (
    select selected.course_id, (selected.position - 1)::integer as order_index
    from unnest(v_course_ids) with ordinality as selected(course_id, position)
  )
  insert into public.learning_path_courses (path_id, course_id, order_index, unlock_rule, is_required)
  select v_path_id, desired.course_id, desired.order_index, 'complete_previous', true
  from desired
  where not exists (
    select 1 from public.learning_path_courses pc
    where pc.path_id = v_path_id and pc.course_id = desired.course_id
  );

  return v_path_id;
end;
$$;

revoke all on function public.save_learning_path(uuid, uuid, text, text, text, text, uuid[], boolean) from public, anon;
grant execute on function public.save_learning_path(uuid, uuid, text, text, text, text, uuid[], boolean) to authenticated;

create or replace function public.set_learning_path_published(p_path_id uuid, p_is_published boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.learning_paths where id = p_path_id for update;
  if not found then
    raise exception 'Learning path not found.' using errcode = 'P0002';
  end if;
  if not public.can_manage_learning_path(v_organization_id) then
    raise exception 'You do not have permission to update this learning path.' using errcode = '42501';
  end if;
  if p_is_published and not exists (
    select 1 from public.learning_path_courses pc where pc.path_id = p_path_id
  ) then
    raise exception 'Add at least one course before publishing this path.' using errcode = '22023';
  end if;
  if p_is_published and exists (
    select 1
    from public.learning_path_courses pc
    join public.courses c on c.id = pc.course_id
    where pc.path_id = p_path_id and (not c.is_published or c.archived_at is not null)
  ) then
    raise exception 'Publish every course in this path before publishing the path.' using errcode = '22023';
  end if;
  update public.learning_paths set is_published = p_is_published where id = p_path_id;
end;
$$;

revoke all on function public.set_learning_path_published(uuid, boolean) from public, anon;
grant execute on function public.set_learning_path_published(uuid, boolean) to authenticated;

create or replace function public.reorder_learning_path_courses(p_path_id uuid, p_step_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
  v_step_count integer;
  v_distinct_count integer;
  v_existing_count integer;
begin
  select organization_id into v_organization_id
  from public.learning_paths where id = p_path_id for update;
  if not found then
    raise exception 'Learning path not found.' using errcode = 'P0002';
  end if;
  if not public.can_manage_learning_path(v_organization_id) then
    raise exception 'You do not have permission to update this learning path.' using errcode = '42501';
  end if;
  select count(*), count(distinct step_id)
    into v_step_count, v_distinct_count
    from unnest(coalesce(p_step_ids, '{}'::uuid[])) as selected(step_id);
  select count(*) into v_existing_count
    from public.learning_path_courses pc where pc.path_id = p_path_id;
  if v_step_count <> v_distinct_count or v_step_count <> v_existing_count or exists (
    select 1 from unnest(coalesce(p_step_ids, '{}'::uuid[])) as selected(step_id)
    where not exists (
      select 1 from public.learning_path_courses pc
      where pc.id = selected.step_id and pc.path_id = p_path_id
    )
  ) then
    raise exception 'The submitted course order does not match this path.' using errcode = '22023';
  end if;
  with desired as (
    select selected.step_id, (selected.position - 1)::integer as order_index
    from unnest(coalesce(p_step_ids, '{}'::uuid[])) with ordinality as selected(step_id, position)
  )
  update public.learning_path_courses pc
  set order_index = desired.order_index
  from desired
  where pc.id = desired.step_id and pc.path_id = p_path_id;
end;
$$;

revoke all on function public.reorder_learning_path_courses(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_learning_path_courses(uuid, uuid[]) to authenticated;

create or replace function public.add_learning_path_course(p_path_id uuid, p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
  v_is_published boolean;
  v_step_id uuid;
  v_order_index integer;
begin
  select organization_id, is_published into v_organization_id, v_is_published
  from public.learning_paths where id = p_path_id for update;
  if not found then
    raise exception 'Learning path not found.' using errcode = 'P0002';
  end if;
  if not public.can_manage_learning_path(v_organization_id) then
    raise exception 'You do not have permission to update this learning path.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courses c where c.id = p_course_id) then
    raise exception 'Course not found.' using errcode = '22023';
  end if;
  if v_is_published and exists (
    select 1 from public.courses c where c.id = p_course_id and (not c.is_published or c.archived_at is not null)
  ) then
    raise exception 'Unpublish this path before adding a draft or archived course.' using errcode = '22023';
  end if;
  if exists (select 1 from public.learning_path_courses pc where pc.path_id = p_path_id and pc.course_id = p_course_id) then
    raise exception 'This course is already in the learning path.' using errcode = '23505';
  end if;
  select coalesce(max(order_index), -1) + 1 into v_order_index
  from public.learning_path_courses where path_id = p_path_id;
  insert into public.learning_path_courses (path_id, course_id, order_index, unlock_rule, is_required)
  values (p_path_id, p_course_id, v_order_index, 'complete_previous', true)
  returning id into v_step_id;
  return v_step_id;
end;
$$;

revoke all on function public.add_learning_path_course(uuid, uuid) from public, anon;
grant execute on function public.add_learning_path_course(uuid, uuid) to authenticated;

create or replace function public.remove_learning_path_course(p_step_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path_id uuid;
  v_organization_id uuid;
begin
  select path_id into v_path_id from public.learning_path_courses where id = p_step_id;
  if not found then
    raise exception 'Learning path step not found.' using errcode = 'P0002';
  end if;
  select organization_id into v_organization_id
  from public.learning_paths where id = v_path_id for update;
  if not public.can_manage_learning_path(v_organization_id) then
    raise exception 'You do not have permission to update this learning path.' using errcode = '42501';
  end if;
  delete from public.learning_path_courses where id = p_step_id;
  with ordered as (
    select id, (row_number() over (order by order_index, id) - 1)::integer as next_order
    from public.learning_path_courses where path_id = v_path_id
  )
  update public.learning_path_courses pc set order_index = ordered.next_order
  from ordered where pc.id = ordered.id;
end;
$$;

revoke all on function public.remove_learning_path_course(uuid) from public, anon;
grant execute on function public.remove_learning_path_course(uuid) to authenticated;

create or replace function public.assign_learning_path_to_users(
  p_path_id uuid,
  p_organization_id uuid,
  p_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path_organization_id uuid;
  v_user_ids uuid[] := coalesce(p_user_ids, '{}'::uuid[]);
  v_requested integer;
  v_enrolled integer;
begin
  if auth.uid() is null or not public.can_manage_learning_path(p_organization_id) then
    raise exception 'You do not have permission to assign learning paths for this organization.' using errcode = '42501';
  end if;
  select organization_id into v_path_organization_id
  from public.learning_paths
  where id = p_path_id and is_published;
  if not found then
    raise exception 'Publish the learning path before assigning it.' using errcode = '22023';
  end if;
  if v_path_organization_id is not null and v_path_organization_id <> p_organization_id then
    raise exception 'This learning path belongs to a different organization.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'The selected organization could not be found.' using errcode = '22023';
  end if;

  select count(distinct user_id) into v_requested
  from unnest(v_user_ids) as selected(user_id)
  where user_id is not null;
  if v_requested = 0 then
    raise exception 'Select at least one learner.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from (select distinct user_id from unnest(v_user_ids) as selected(user_id) where user_id is not null) target
    where not exists (
      select 1 from public.organization_members om
      where om.user_id = target.user_id
        and om.organization_id = p_organization_id
        and om.status::text = 'active'
    )
  ) then
    raise exception 'One or more selected learners are not active members of this organization.' using errcode = '22023';
  end if;

  insert into public.learning_path_enrollments (user_id, path_id, status, current_course_index)
  select distinct selected.user_id, p_path_id, 'in_progress', 0
  from unnest(v_user_ids) as selected(user_id)
  where selected.user_id is not null
  on conflict (user_id, path_id) do nothing;
  get diagnostics v_enrolled = row_count;

  return jsonb_build_object(
    'success', true,
    'enrolled', v_enrolled,
    'already_enrolled', v_requested - v_enrolled
  );
end;
$$;

revoke all on function public.assign_learning_path_to_users(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.assign_learning_path_to_users(uuid, uuid, uuid[]) to authenticated;

create or replace function public.get_learning_path_enrollment_counts(p_organization_id uuid)
returns table(path_id uuid, total bigint, completed bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_manage_learning_path(p_organization_id) then
    raise exception 'You do not have permission to view learning path assignments for this organization.' using errcode = '42501';
  end if;
  return query
  select lp.id,
         count(lpe.id)::bigint,
         count(lpe.id) filter (where lpe.status = 'completed')::bigint
  from public.learning_paths lp
  left join public.learning_path_enrollments lpe
    on lpe.path_id = lp.id
   and (p_organization_id is null or exists (
     select 1 from public.organization_members om
     where om.user_id = lpe.user_id
       and om.organization_id = p_organization_id
       and om.status::text = 'active'
   ))
  where lp.organization_id = p_organization_id or lp.organization_id is null
  group by lp.id;
end;
$$;

revoke all on function public.get_learning_path_enrollment_counts(uuid) from public, anon;
grant execute on function public.get_learning_path_enrollment_counts(uuid) to authenticated;
