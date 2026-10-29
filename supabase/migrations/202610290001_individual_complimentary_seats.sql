-- Explicit complimentary seats belong to individual organization members.
-- Only privileged database operations may issue or revoke these allowances.
create table if not exists public.organization_complimentary_seats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  granted_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.organization_complimentary_seats enable row level security;
revoke all on public.organization_complimentary_seats from public, anon, authenticated;

create or replace function public.enforce_membership_seat_capacity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if new.status<>'active' then return new; end if;
 if tg_op='UPDATE' then
   if old.status='active' and old.organization_id=new.organization_id then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,200001));
 perform 1 from public.organizations where id=new.organization_id for update;
 if exists (
   select 1 from public.organization_complimentary_seats s
   where s.organization_id=new.organization_id and s.user_id=new.user_id
 ) then return new; end if;
 if not public.check_seat_available(new.organization_id) then
   if coalesce(new.join_source,'')='shareable_link' then new.status:='pending'; new.joined_at:=null;
   else raise exception 'No seats available in this organization'; end if;
 end if;
 return new;
end $$;

comment on table public.organization_complimentary_seats is
 'Privileged, individual seat allowances. These do not grant membership, a cohort, an elevated role, or transferable organization seat credits.';
