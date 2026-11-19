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
  // GitHub App (read-only repository scan). The private key is write-only: the server never returns it.
  github: () => request('GET', '/github'),
  saveGithub: (data) => request('PUT', '/github', data),
  clearGithubKey: () => request('DELETE', '/github/key'),
  testGithub: () => request('POST', '/github/test'),
  setRepos: (id, repos) => request('PUT', `/apps/${id}/repos`, { repos }),
  scan: (id) => request('POST', `/apps/${id}/scan`),
  setCoverage: (id, data) => request('PUT', `/apps/${id}/coverage`, data),
  clearCoverage: (id, reason) => request('DELETE', `/apps/${id}/coverage`, { reason }),
  reassessmentCheck: (id) => request('POST', `/apps/${id}/reassessment-check`),
  // Returns { blob, fileName, matched } for the generated Word document.
  async reassessmentDocument(id, checkId, confirmations) {
    const res = await fetch(`${BASE}/apps/${id}/reassessment-document`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ checkId, confirmations }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'PIA reassessment.docx';
    return { blob: await res.blob(), fileName: name, matched: Number(res.headers.get('x-answers-matched') || 0) };
  },
};
