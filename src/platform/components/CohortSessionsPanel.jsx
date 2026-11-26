import React, { useId, useRef, useState } from 'react';
import { createCohortSession, updateCohortSession, deleteCohortSession } from '../../lib/api/platform.js';
import { cohortSessionPayload, safeSessionUrl, sessionLocalStart, sessionLocalFields } from '../../lib/cohortSessionDraft.js';
import './CohortSessionsPanel.css';

export function CohortSessionsPanel({ cohortId, currentUserId, sessions = [], onChanged, allowRemove = false, createSession = createCohortSession, updateSession = updateCohortSession, removeSession = deleteCohortSession }) {
  const [title, setTitle] = useState(''), [date, setDate] = useState(''), [time, setTime] = useState(''), [joinUrl, setJoinUrl] = useState(''), [description, setDescription] = useState('');
  const [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [removing, setRemoving] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [saved, setSaved] = useState([]), [removed, setRemoved] = useState([]);
  const submitting = useRef(false), formRef = useRef(null), titleRef = useRef(null);
  const errorId = useId();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows = [...new Map([...sessions, ...saved].map(item => [item.id, item])).values()].filter(item => !removed.includes(item.id)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  function reset() { setEditing(null); setTitle(''); setDate(''); setTime(''); setJoinUrl(''); setDescription(''); }
  function edit(item) {
    const local = sessionLocalFields(item.starts_at);
    setEditing(item.id); setTitle(item.title || ''); setDate(local.date); setTime(local.time); setJoinUrl(item.join_url || ''); setDescription(item.description || ''); setError(''); setNotice('');
    formRef.current?.scrollIntoView({ block: 'center' }); titleRef.current?.focus({ preventScroll: true });
  }
  async function schedule(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const draft = { cohortId, createdBy: currentUserId, title, startsAt: sessionLocalStart(date, time), joinUrl, description };
      const payload = cohortSessionPayload(draft);
      const values = { ...draft, startsAt: payload.starts_at, joinUrl: payload.join_url };
      const record = editing ? await updateSession({ ...values, id: editing }) : await createSession(values);
      if (!record?.id) throw new Error('The session was not saved. Please try again.');
      setSaved(previous => [...previous.filter(item => item.id !== record.id), record]);
      const wasEditing = !!editing; reset();
      setNotice(wasEditing ? 'Session updated. The meeting link is available to the cohort.' : 'Session scheduled. It is now available in this cohort.');
      // A refresh failure must not misreport an already committed save as failed.
      Promise.resolve().then(() => onChanged?.()).catch(() => setNotice('Session saved. Refresh the page to reload the latest cohort details.'));
    } catch (failure) { setError(failure.message || 'Could not save the session. Please retry.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function remove(item) {
    if (removing) return;
    setRemoving(item.id); setError(''); setNotice('');
    try { await removeSession(item.id); setRemoved(previous => [...previous, item.id]); if (editing === item.id) reset(); setNotice('Session removed.'); Promise.resolve().then(() => onChanged?.()).catch(() => {}); }
    catch (failure) { setError(failure.message || 'Could not remove the session. Please retry.'); }
    finally { setRemoving(null); }
  }
  return <section className="ta-card cohort-sessions-panel" aria-label="Cohort sessions">
    <h2>Sessions</h2><p>Schedule a live session or add a meeting link to an existing session. Dates and times use your time zone: {zone}.</p>
    <h3>{editing ? 'Edit session' : 'Add a session'}</h3>
    <form ref={formRef} onSubmit={schedule} className="cohort-session-form" aria-label={editing ? 'Edit cohort session' : 'Add cohort session'} aria-describedby={error ? errorId : undefined}>
      <label className="cohort-session-wide">Session title<input ref={titleRef} className="ta-input" required maxLength={200} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="For example, Week 1 live workshop" /></label>
      <label>Session date<input className="ta-input" type="date" required value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>
      <label>Start time<input className="ta-input" type="time" required step={60} value={time} disabled={busy} onChange={event => setTime(event.target.value)} /></label>
      <label className="cohort-session-wide">Meeting link (optional)<input className="ta-input" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={joinUrl} disabled={busy} onChange={event => setJoinUrl(event.target.value)} placeholder="https://meet.google.com/... or your Zoom/Teams link" /></label>
      <label className="cohort-session-wide">Description (optional)<textarea className="ta-input" rows={3} maxLength={5000} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
      {error && <p id={errorId} className="support-error cohort-session-wide" role="alert">{error}</p>}
      {notice && <p className="cohort-session-wide" role="status">{notice}</p>}
      <div className="cohort-session-actions cohort-session-wide"><button className="ta-btn ta-btn-primary" disabled={busy || !title.trim() || !date || !time}>{busy ? 'Saving…' : editing ? 'Save session' : 'Schedule session'}</button>{editing && <button type="button" className="ta-btn ta-btn-outline" disabled={busy} onClick={() => { reset(); setError(''); }}>Cancel edit</button>}</div>
    </form>
    <h3>Scheduled sessions ({rows.length})</h3>
    {!rows.length && <p>No sessions scheduled yet. Add the first session above.</p>}
    <ul className="cohort-session-list">{rows.map(item => {
      let url; try { url = safeSessionUrl(item.join_url); } catch { url = null; }
      return <li key={item.id}>
        <div><strong>{item.title}</strong><p><time dateTime={item.starts_at}>{new Date(item.starts_at).toLocaleString()}</time></p>{item.description && <p>{item.description}</p>}</div>
        <div className="cohort-session-actions">{url ? <a className="ta-btn ta-btn-outline ta-btn-sm" href={url} target="_blank" rel="noopener noreferrer">Join session</a> : <span>No meeting link added</span>}
          <button type="button" className="ta-btn ta-btn-outline ta-btn-sm" disabled={busy || !!removing} onClick={() => edit(item)}>{url ? 'Edit session' : 'Edit session / add link'}</button>
          {allowRemove && <button type="button" className="ta-btn ta-btn-outline ta-btn-sm" disabled={busy || !!removing} aria-label={`Remove session ${item.title}`} onClick={() => remove(item)}>{removing === item.id ? 'Removing…' : 'Remove'}</button>}</div>
      </li>;
    })}</ul>
  </section>;
}
