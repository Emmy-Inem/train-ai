import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Individual complimentary seats cannot be self-issued or reused for another member or tenant', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table organizations(id uuid primary key);
      create table user_profiles(id uuid primary key);
      create table organization_members(organization_id uuid, user_id uuid, status text, join_source text, joined_at timestamptz);
      create function check_seat_available(uuid) returns boolean language sql as $$select false$$;
      insert into organizations values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      insert into user_profiles values ('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
    `);
    await db.exec(fs.readFileSync(new URL('../../supabase/migrations/202610290001_individual_complimentary_seats.sql', import.meta.url),'utf8'));
    await db.exec(`create trigger capacity before insert or update of status,organization_id on organization_members for each row execute function enforce_membership_seat_capacity();
      insert into organization_complimentary_seats(organization_id,user_id,reason) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Authorized cohort allowance');`);
    const insert = (org, user, source='admin_invite') => db.query(`insert into organization_members values ($1,$2,'active',$3,now()) returning status`,[`00000000-0000-0000-0000-00000000000${org}`,`00000000-0000-0000-0000-00000000000${user}`,source]);
    assert.equal((await insert(1,3)).rows[0].status,'active');
    await assert.rejects(insert(1,4), /No seats available/);
    await assert.rejects(insert(2,3), /No seats available/);
    assert.equal((await insert(1,4,'shareable_link')).rows[0].status,'pending');
    await db.exec('set role authenticated');
    await assert.rejects(db.exec("insert into organization_complimentary_seats values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','Self grant',now())"), /permission denied/);
    await assert.rejects(db.query('select * from organization_complimentary_seats'), /permission denied/);
  } finally { await db.close(); }
});
