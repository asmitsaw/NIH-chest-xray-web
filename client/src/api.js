const KEY = 'chestx.session';
export const session = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } },
  set(v) { sessionStorage.setItem(KEY, JSON.stringify(v)); },
  clear() { sessionStorage.removeItem(KEY); },
};

async function call(path, { method = 'GET', body, form, raw } = {}) {
  const s = session.get();
  const headers = {};
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch(`/api${path}`, { method, headers, body: form || (body && JSON.stringify(body)) }); }
  catch { throw new Error('Cannot reach the server. Check that the API is running on port 4000.'); }
  if (res.status === 401 && s) { session.clear(); window.location.assign('/login'); throw new Error('Session expired.'); }
  if (raw) { if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed'); return res; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (username, password) => call('/auth/login', { method: 'POST', body: { username, password } }),
  meta: () => call('/meta'),
  dashboard: () => call('/dashboard'),
  patients: () => call('/patients'),
  patient: (id) => call(`/patients/${id}`),
  addPatient: (b) => call('/patients', { method: 'POST', body: b }),
  doctors: () => call('/doctors'),
  studies: (patientId) => call(`/studies${patientId ? `?patient_id=${patientId}` : ''}`),
  study: (id) => call(`/studies/${id}`),
  upload: (form) => call('/studies', { method: 'POST', form }),
  analyze: (id) => call(`/studies/${id}/analyze`, { method: 'POST' }),
  gradcam: (id, b) => call(`/studies/${id}/gradcam`, { method: 'POST', body: b }),
  saveReport: (id, b) => call(`/studies/${id}/report`, { method: 'PUT', body: b }),
  amendReport: (id, b) => call(`/studies/${id}/report/amend`, { method: 'POST', body: b }),
  compare: (a, b) => call(`/compare?a=${a}&b=${b}`),
  appointments: () => call('/appointments'),
  book: (b) => call('/appointments', { method: 'POST', body: b }),
  setAppt: (id, status) => call(`/appointments/${id}`, { method: 'PATCH', body: { status } }),
  ask: (patient_id, question) => call('/assistant', { method: 'POST', body: { patient_id, question } }),
  performance: () => call('/performance'),
  adminUsers: () => call('/admin/users'),
  addUser: (b) => call('/admin/users', { method: 'POST', body: b }),
  setUserActive: (id, is_active) => call(`/admin/users/${id}`, { method: 'PATCH', body: { is_active } }),
  audit: () => call('/admin/audit'),
  health: () => call('/admin/health'),
  async blobUrl(path) { const r = await call(path, { raw: true }); return URL.createObjectURL(await r.blob()); },
  async download(path, name) {
    const r = await call(path, { raw: true }); const u = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
  },
};
