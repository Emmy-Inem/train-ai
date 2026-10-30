import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

test('Learner course lookup combines own and shared assignments without hiding shared courses or losing metadata', async () => {
  const tables = {
    cohort_courses: [{id:'shared-row',cohort_id:'cohort',course_id:'shared',assignment_scope:'cohort'}, {id:'legacy',cohort_id:'cohort',course_id:'bob',assignment_scope:'individuals'}],
    cohort_learner_courses: [{id:'alice-row',cohort_id:'cohort',user_id:'alice',course_id:'own'}, {id:'bob-row',cohort_id:'cohort',user_id:'bob',course_id:'bob'}],
    courses: ['own','shared','bob'].map(id=>({id,title:id,is_published:true,category:'Code',duration_hours:4})),
    course_enrollments: [{user_id:'alice',course_id:'own',progress_percentage:67}],
  };
  let fail = false;
  const supabase = {from(table) {
    const predicates=[];
    const q={select(columns){assert.ok(!columns.includes('courses('));return q;},eq(k,v){predicates.push(r=>r[k]===v);return q;},in(k,v){predicates.push(r=>v.includes(r[k]));return q;},then(resolve,reject){return Promise.resolve(fail?{error:Error('offline')}:{data:tables[table].filter(r=>predicates.every(p=>p(r))).map(r=>({...r}))}).then(resolve,reject);}};
    return q;
  }};
  const source=fs.readFileSync('src/lib/api/schemaHelper.js','utf8');
  const fn=source.slice(source.indexOf('export async function fetchCohortAssignedCourses'),source.indexOf('/**',source.indexOf('export async function fetchCohortAssignedCourses'))).replace('export ','');
  const context={supabase};vm.runInNewContext(fn,context);
  const rows=await context.fetchCohortAssignedCourses('cohort','alice');
  assert.deepEqual(Array.from(rows,r=>r.course_id).sort(),['own','shared']);
  assert.equal(rows.find(r=>r.course_id==='own').courses.progress,67);
  assert.equal(rows.find(r=>r.course_id==='own').courses.duration_hours,4);
  assert.equal((await context.fetchCohortAssignedCourses('cohort','new-member')).length,1);
  fail=true;await assert.rejects(context.fetchCohortAssignedCourses('cohort','alice'),/Could not load/);
});

test('Database assignment scope stays individual, every assignment enrolls, and shared curriculum includes future members without resetting progress', async () => {
  const db=new PGlite();
  const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function is_super_admin(uuid) returns boolean language sql as $$select false$$;
      create table cohorts(id uuid primary key,organization_id uuid);
      create table organization_members(organization_id uuid,user_id uuid,status text,role text);
      create table courses(id uuid primary key,organization_id uuid);
      create table cohort_members(cohort_id uuid,user_id uuid);
      create table cohort_courses(id uuid default gen_random_uuid(),cohort_id uuid,course_id uuid,due_at date,unique(cohort_id,course_id));
      create table cohort_learner_courses(id uuid default gen_random_uuid(),cohort_id uuid,course_id uuid,user_id uuid,assigned_by uuid);
      create table course_enrollments(user_id uuid,course_id uuid,enrolled_at timestamptz,progress_percentage numeric,unique(user_id,course_id));
      insert into cohorts values('${id(1)}','${id(2)}');
      insert into organization_members values('${id(2)}','${id(3)}','active','admin');
      insert into courses values('${id(4)}','${id(2)}'),('${id(5)}','${id(2)}'),('${id(9)}','${id(10)}');
      insert into cohort_members values('${id(1)}','${id(6)}'),('${id(1)}','${id(7)}');
      insert into cohort_courses(cohort_id,course_id) values('${id(1)}','${id(4)}'),('${id(1)}','${id(5)}');
      insert into cohort_learner_courses(cohort_id,course_id,user_id) values('${id(1)}','${id(4)}','${id(6)}');
      insert into course_enrollments values('${id(6)}','${id(4)}',now(),73);`);
    await db.exec(fs.readFileSync('supabase/migrations/202610300001_cohort_course_visibility.sql','utf8'));
    assert.equal((await db.query(`select assignment_scope from cohort_courses where course_id='${id(4)}'`)).rows[0].assignment_scope,'individuals');
    assert.equal((await db.query('select count(*)::int n from course_enrollments')).rows[0].n,3);
    await db.exec(`insert into cohort_members values('${id(1)}','${id(8)}')`);
    assert.equal((await db.query(`select course_id from course_enrollments where user_id='${id(8)}'`)).rows[0].course_id,id(5));
    await db.exec(`select set_config('test.uid','${id(3)}',false)`);
    const assign=(course,users,all=false)=>db.query('select assign_course_to_cohort_members($1,$2,$3,$4)',[id(1),id(course),users.map(id),all]);
    await assign(4,[6]);
    assert.equal((await db.query(`select progress_percentage from course_enrollments where user_id='${id(6)}' and course_id='${id(4)}'`)).rows[0].progress_percentage,'73');
    await assign(5,[6]);
    assert.equal((await db.query(`select assignment_scope from cohort_courses where course_id='${id(5)}'`)).rows[0].assignment_scope,'cohort');
    await assert.rejects(assign(9,[6]),/Course not found/);
    await assert.rejects(assign(4,[99]),/do not belong/);
    await db.exec(`select set_config('test.uid','${id(6)}',false)`);
    await assert.rejects(assign(4,[7]),/Not authorized/);
  } finally {await db.close();}
});
