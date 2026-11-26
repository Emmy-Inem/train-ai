import test from 'node:test';
import assert from 'node:assert/strict';
import { cohortSessionPayload, safeSessionUrl, sessionLocalStart } from '../../src/lib/cohortSessionDraft.js';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const draft={cohortId:'cohort',createdBy:'admin',title:'  Live workshop  ',startsAt:'2026-11-25T10:30:00+01:00',joinUrl:' https://meet.example.invalid/workshop ',description:' Session notes '};
test('cohort session scheduling preserves the chosen instant, meeting link and description',()=>{
 const payload=cohortSessionPayload(draft);
 assert.equal(payload.starts_at,'2026-11-25T09:30:00.000Z');
 assert.equal(payload.title,'Live workshop');assert.equal(payload.join_url,'https://meet.example.invalid/workshop');assert.equal(payload.description,'Session notes');
 assert.equal(cohortSessionPayload({...draft,joinUrl:'',description:''}).join_url,null);
});

test('separate phone date/time controls preserve local wall time across time zones',()=>{
 const moduleUrl=new URL('../../src/lib/cohortSessionDraft.js',import.meta.url).href;
 for(const [zone,iso] of [['Africa/Lagos','2026-11-27T08:30:00.000Z'],['America/New_York','2026-11-27T14:30:00.000Z'],['Asia/Kathmandu','2026-11-27T03:45:00.000Z']]) {
  const script=`import {sessionLocalStart,sessionLocalFields} from ${JSON.stringify(moduleUrl)}; const start=sessionLocalStart('2026-11-27','09:30');console.log(JSON.stringify({start,...sessionLocalFields(start)}));`;
  const value=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:zone},encoding:'utf8'}));
  assert.deepEqual(value,{start:iso,date:'2026-11-27',time:'09:30'});
 }
 for(const [date,time] of [['2026-02-30','09:00'],['2026-11-27','24:00'],['','09:00'],['2026-11-27','']])assert.throws(()=>sessionLocalStart(date,time));
 const dst=`import {sessionLocalStart} from ${JSON.stringify(moduleUrl)};try{sessionLocalStart('2027-03-14','02:30');process.exit(1)}catch{console.log('rejected')}`;
 assert.match(execFileSync(process.execPath,['--input-type=module','-e',dst],{env:{...process.env,TZ:'America/New_York'},encoding:'utf8'}),/rejected/);
});

test('session APIs confirm persisted records, keep the creator unchanged, and bind edits to the cohort',async()=>{
 const source=fs.readFileSync(new URL('../../src/lib/api/platform.js',import.meta.url),'utf8');
 const at=source.indexOf('export async function createCohortSession('),end=source.indexOf('/* ==========================================================================',at);
 const code=source.slice(at,end).replaceAll('export async function','async function');
 let values,filters=[],response={data:{id:'session',join_url:'https://meet.example.invalid/workshop'},error:null};
 const builder={insert(data){values=data;return this},update(data){values=data;return this},eq(key,value){filters.push([key,value]);return this},select(){return this},async single(){return response}};
 const load=client=>new Function('supabase','cohortSessionPayload',code+'; return {createCohortSession,updateCohortSession};')(client,cohortSessionPayload);
 const api=load({from(table){assert.equal(table,'cohort_sessions');return builder}});
 await api.createCohortSession(draft);assert.equal(values.join_url,'https://meet.example.invalid/workshop');assert.equal(values.created_by,'admin');
 await api.updateCohortSession({...draft,id:'session'});assert.deepEqual(filters,[['id','session'],['cohort_id','cohort']]);assert.equal(values.created_by,undefined);
 response={data:null,error:null};await assert.rejects(api.createCohortSession(draft),/not saved/);await assert.rejects(api.updateCohortSession({...draft,id:'session'}),/not updated/);
 response={data:null,error:{message:'Permission denied'}};await assert.rejects(api.updateCohortSession({...draft,id:'session'}),{message:'Permission denied'});
 await assert.rejects(load(null).createCohortSession(draft),/Connect/);
});
test('cohort sessions reject missing identity, invalid dates and unsafe meeting links',()=>{
 for(const patch of [{createdBy:null},{cohortId:null},{title:' '},{startsAt:'invalid'},{startsAt:''}])assert.throws(()=>cohortSessionPayload({...draft,...patch}));
 for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:secret@example.invalid','ftp://example.invalid'])assert.throws(()=>safeSessionUrl(url),/valid/);
 assert.throws(()=>cohortSessionPayload({...draft,description:'x'.repeat(5001)}),/5,000/);
});
