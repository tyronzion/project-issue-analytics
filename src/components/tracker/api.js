// Assessment Tracker API client (served by vite.config.ts at /api/tracker).
const BASE = '/api/tracker';

export const getUser = () => {
  try {
    return localStorage.getItem('assessment_tracker_user') || '';
  } catch {
    return '';
  }
};
export const setUser = (name) => {
  try {
    localStorage.setItem('assessment_tracker_user', name);
  } catch {
    /* storage unavailable */
  }
};

async function request(method, url, body, { raw = false } = {}) {
  const headers = { 'x-user': getUser() };
  if (body !== undefined && !raw) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = 'application/octet-stream';
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  // Tech Risk Analyzer: read one public advisory page (server-side, SSRF-guarded; D19).
  readAdvisory: (url) => request('POST', '/tech-risk/advisory', { url }),
  cycles: () => request('GET', '/cycles'),
  createCycle: (track, year) => request('POST', '/cycles', { track, year }),
  assessments: (cycleId) => request('GET', `/cycles/${cycleId}/assessments`),
  createAssessment: (cycleId, data) => request('POST', `/cycles/${cycleId}/assessments`, data),
  updateAssessment: (id, patch) => request('PATCH', `/assessments/${id}`, patch),
  deleteAssessment: (id) => request('DELETE', `/assessments/${id}`),
  history: (id) => request('GET', `/assessments/${id}/history`),
  captureSeal: (id, seal, ticketKey) => request('POST', `/assessments/${id}/seal`, { seal, ticketKey }),
  captureReport: (id, snapshot) => request('POST', `/assessments/${id}/report-snapshot`, snapshot),
  unfreezeReport: (id) => request('DELETE', `/assessments/${id}/report-snapshot`),
  syncStatus: () => request('GET', '/sync'),
  syncNow: () => request('POST', '/sync'),
  link: (product, project) => request('POST', '/links', { product, project }),
  unlink: (productKey) => request('DELETE', `/links/${encodeURIComponent(productKey)}`),
  previewImport: (file) => request('POST', '/import/preview', file, { raw: true }),
  runImport: (file, cycles) => request('POST', `/import?cycles=${encodeURIComponent(JSON.stringify(cycles))}`, file, { raw: true }),
};

// App Access (access.js): web URL or build link and test accounts per app. Passwords are never in these
// responses; copyPassword fetches one for the Copy button (logged on the server).
const appPath = (key) => `/access/apps/${encodeURIComponent(key)}`;
export const accessApi = {
  list: () => request('GET', '/access'),
  app: (key) => request('GET', appPath(key)),
  saveApp: (key, data) => request('PUT', appPath(key), data),
  addAccount: (key, data) => request('POST', `${appPath(key)}/accounts`, data),
  updateAccount: (key, id, data) => request('PATCH', `${appPath(key)}/accounts/${id}`, data),
  deleteAccount: (key, id) => request('DELETE', `${appPath(key)}/accounts/${id}`),
  copyPassword: (key, id) => request('POST', `${appPath(key)}/accounts/${id}/copy`, {}),
};
