// PIA API client (served by vite.config.ts at /api/pia). The server records the signed-in user on every change.
const BASE = '/api/pia';

async function request(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const piaApi = {
  apps: () => request('GET', '/apps'),
  app: (id) => request('GET', `/apps/${id}`),
  addApp: (name) => request('POST', '/apps', { name }),
  setHidden: (id, hidden, hiddenReason) => request('PATCH', `/apps/${id}`, { hidden, hiddenReason }),
  addReassessment: (id, data) => request('POST', `/apps/${id}/reassessments`, data),
  removeReassessment: (id) => request('DELETE', `/reassessments/${id}`),
  syncStatus: () => request('GET', '/sync'),
  syncNow: () => request('POST', '/sync'),
  link: (product, appId) => request('POST', '/links', { product, appId }),
  unlink: (productKey) => request('DELETE', `/links/${encodeURIComponent(productKey)}`),
  setDueSoonDays: (dueSoonDays) => request('PUT', '/settings', { dueSoonDays }),
};
