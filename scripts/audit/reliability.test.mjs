import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCourseLessons } from '../../src/lib/lessonPersistence.js';
import { requestPasswordRecovery, isPasswordSetupLocation } from '../../src/lib/passwordRecovery.js';
import { parseVideoSource } from '../../src/lib/videoSource.js';

test('Invitation and recovery callbacks require password setup while ordinary sign-in does not', () => {
  assert.equal(isPasswordSetupLocation({hash:'#access_token=fixture&type=invite'}),true);
  assert.equal(isPasswordSetupLocation({search:'?token_hash=fixture&type=invite'}),true);
  assert.equal(isPasswordSetupLocation({hash:'#access_token=fixture&type=recovery'}),true);
  assert.equal(isPasswordSetupLocation({search:'?view=auth&recovery=1'}),true);
  assert.equal(isPasswordSetupLocation({hash:'#access_token=fixture&type=signup'}),false);
  assert.equal(isPasswordSetupLocation({search:'?view=auth'}),false);
});

test('Video URLs support Shorts, mobile, privacy embeds and reordered query parameters', () => {
  for (const value of ['https://youtube.com/shorts/abcdefghijk', 'https://m.youtube.com/watch?feature=share&v=abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk', 'youtu.be/abcdefghijk?t=5', 'abcdefghijk']) {
    assert.deepEqual(parseVideoSource(value), { type: 'youtube', videoId: 'abcdefghijk' });
  }
  assert.deepEqual(parseVideoSource('https://vimeo.com/123456/privatehash'), { type: 'vimeo', videoId: '123456', hash: 'privatehash' });
  assert.equal(parseVideoSource('https://storage.example/video.mp4?token=fixture').type, 'html5');
  assert.equal(parseVideoSource(' https://mega.nz/folder/folder-id#folder-key/folder/subfolder').type, 'external');
  assert.equal(parseVideoSource('https://mega.nz/file/file-id#file-key').src, 'https://mega.nz/embed/file-id#file-key');
  assert.equal(parseVideoSource('https://mega.nz/#!file-id!file-key').type, 'mega');
  for (const value of ['', null, 'javascript:alert(1)', 'https://youtube.com/playlist?list=PL123', 'https://youtube.com/watch?v=invalid']) assert.equal(parseVideoSource(value).type, 'none');
});

function database({ failUpdate = false } = {}) {
  const rows = [{ id: 'lesson-a', title: 'Original', video_url: 'https://example.com/a.mp4', content: 'Keep content', duration_minutes: 10 }, { id: 'removed' }];
  const deleted = [];
  const client = { from: () => {
    let op = 'select', payload, ids, filters = {};
    const q = {
      select() { return q; }, eq(key, value) { filters[key] = value; return q; },
      in(key, values) { ids = values; return q; },
      update(value) { op = 'update'; payload = value; return q; },
      insert(value) { op = 'insert'; payload = value; return q; },
      delete() { op = 'delete'; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        assert.equal(filters.course_id || payload?.course_id, 'course-a');
        if (op === 'select') return { data: rows.map(row => ({ id: row.id })) };
        if (op === 'update') {
          if (failUpdate) return { error: Error('write denied') };
          const row = rows.find(row => row.id === filters.id);
          Object.assign(row, payload); return { data: [{ id: row.id }] };
        }
        if (op === 'insert') { rows.push({ ...payload, id: 'new-id' }); return { data: [{ id: 'new-id' }] }; }
        deleted.push(...ids); return {};
      }).then(resolve, reject); },
    }; return q;
  }};
  return { client, rows, deleted };
}

test('Editing curriculum preserves lesson identity, content, video URL and duration; only removed IDs are deleted', async () => {
  const db = database();
  const lessons = [{ id: 'lesson-a', title: 'Edited', video_url: 'https://example.com/b.mp4', duration_minutes: 25 }, { id: 'temp-new', title: 'New', videoUrl: 'https://example.com/new.mp4', duration: 8 }];
  await saveCourseLessons(db.client, 'course-a', lessons);
  assert.equal(db.rows[0].id, 'lesson-a');
  assert.equal(db.rows[0].content, 'Keep content');
  assert.equal(db.rows[0].video_url, lessons[0].video_url);
  assert.equal(db.rows[0].duration_minutes, 25);
  assert.deepEqual(db.deleted, ['removed']);
  assert.equal(lessons[1].id, 'new-id');
});

test('A failed lesson update stops the save before any lesson is deleted', async () => {
  const db = database({ failUpdate: true });
  await assert.rejects(saveCourseLessons(db.client, 'course-a', [{ id: 'lesson-a', title: 'Edit' }]), /write denied/);
  assert.deepEqual(db.deleted, []);
});

test('Recovery never exposes returned credentials or equates neutral success with email delivery', async () => {
  const result = await requestPasswordRecovery({ functions: { invoke: async () => ({ data: { success: true, emailSent: false, otp: 'secret', actionLink: 'secret' } }) } }, ' Person@Example.com ', 'https://trainailtd.com/');
  assert.equal(result.success, true);
  assert.equal(result.emailSent, false);
  assert.equal(result.email, 'person@example.com');
  assert.equal(result.otp, undefined);
  assert.equal(result.actionLink, undefined);
  assert.equal((await requestPasswordRecovery(null, 'person@example.com', '')).success, false);
});

test('Recovery respects HTTP 429 and delivery failures without bypassing the server limiter', async () => {
  for (const status of [429, 503]) {
    let nativeCalls = 0;
    const client = { functions: { invoke: async () => ({ error: { context: new Response(JSON.stringify({ error: 'Unavailable' }), { status }) } }) }, auth: { resetPasswordForEmail: async () => { nativeCalls++; return {}; } } };
    const result = await requestPasswordRecovery(client, 'person@example.com', 'https://trainailtd.com/');
    assert.equal(result.success, false);
    assert.equal(Boolean(result.rateLimited), status === 429);
    assert.equal(nativeCalls, 0);
  }
});

test('An undeployed recovery function falls back once to native recovery without claiming delivery', async () => {
  let calls = 0;
  const client = { functions: { invoke: async () => ({ error: { context: new Response('{}', { status: 404 }) } }) }, auth: { resetPasswordForEmail: async () => { calls++; return {}; } } };
  const result = await requestPasswordRecovery(client, 'person@example.com', 'https://trainailtd.com/');
  assert.equal(result.success, true);
  assert.equal(result.emailSent, false);
  assert.equal(calls, 1);
});
