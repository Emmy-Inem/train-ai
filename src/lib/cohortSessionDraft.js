export function safeSessionUrl(value) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new Error('Enter a valid http:// or https:// meeting link.'); }
}

// Construct local wall-clock time explicitly: date-only strings otherwise
// parse as UTC, which can move a phone user's session to the previous day.
export function sessionLocalStart(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) throw new Error('Choose a session date and start time.');
  const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  if (year < 1000 || start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day || start.getHours() !== hour || start.getMinutes() !== minute) throw new Error('Choose a valid date and time in your local time zone.');
  return start.toISOString();
}

export function sessionLocalFields(value) {
  const start = new Date(value);
  if (!Number.isFinite(start.getTime())) return { date: '', time: '' };
  const pad = number => String(number).padStart(2, '0');
  return { date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, time: `${pad(start.getHours())}:${pad(start.getMinutes())}` };
}

export function cohortSessionPayload({ cohortId, title, startsAt, joinUrl, description, createdBy }) {
  if (!cohortId || !createdBy) throw new Error('Your cohort or account could not be verified. Refresh the page and try again.');
  if (!title?.trim() || title.trim().length > 200) throw new Error('Enter a session title of up to 200 characters.');
  const start = startsAt ? new Date(startsAt) : null;
  if (!start || !Number.isFinite(start.getTime())) throw new Error('Choose a valid session date and time.');
  if (description?.trim().length > 5000) throw new Error('Keep the session description within 5,000 characters.');
  return { cohort_id: cohortId, created_by: createdBy, title: title.trim(), starts_at: start.toISOString(), join_url: safeSessionUrl(joinUrl), description: description?.trim() || null };
}
