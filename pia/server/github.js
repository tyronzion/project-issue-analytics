import { createSign } from 'node:crypto';

// Read-only GitHub client for the PIA repository scan (DECISIONS D15).
//   - Host is fixed to https://api.github.com. Repo names must look like owner/repo AND the owner must be one of the
//     allowed orgs (admin setting), so the server can't be pointed at arbitrary repos or hosts.
//   - Auth is a GitHub App (Contents: read, Metadata: read). The App's private key signs a short JWT (node:crypto,
//     RS256), which is exchanged for a 1-hour installation token kept in memory only.
//   - Every repository call is a GET. The only other request is the token exchange
//     (POST /app/installations/{id}/access_tokens), which reads nothing and changes nothing in any repository.
//   - Tokens and the key never appear in errors or logs: errors carry only the method, path and HTTP status.

export const API = 'https://api.github.com';
const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const ORG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SHA_RE = /^[0-9a-f]{40}$/;

export const isOrg = (s) => ORG_RE.test(String(s || ''));

// "owner/repo", https://github.com/owner/repo(.git)(/…), git@github.com:owner/repo.git -> "owner/repo" (or null).
export function parseRepo(input) {
  let s = String(input ?? '').trim();
  if (!s || s.length > 300) return null;
  const ssh = /^git@github\.com:(.+)$/i.exec(s);
  if (ssh) s = ssh[1];
  else if (/^https?:\/\//i.test(s)) {
    let u;
    try { u = new URL(s); } catch { return null; }
    if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
    s = u.pathname.replace(/^\/+/, '');
  }
  const [owner, repo] = s.replace(/\.git$/i, '').split('/');
  const name = `${owner}/${(repo || '').replace(/\.git$/i, '')}`;
  return REPO_RE.test(name) && repo !== '.' && repo !== '..' ? name : null;
}

// GitHub repos mentioned in free text (e.g. the tracker's "Repositories" column), de-duplicated.
export function reposFromText(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)[A-Za-z0-9._\/-]{3,160}/gi)) {
    const r = parseRepo(m[0]);
    if (r) out.add(r);
  }
  return [...out];
}

// RS256 JWT for the GitHub App (valid 9 minutes, issued 60 s in the past for clock drift).
export function appJwt({ appId, privateKey, now = Date.now() }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(now / 1000) - 60;
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat, exp: iat + 600, iss: String(appId) })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
  return `${unsigned}.${sig}`;
}

export class GithubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// getCredential(): Promise<{ appId, privateKey } | null>; allowedOrgs(): string[]
export function createGithub({ getCredential, allowedOrgs, fetchImpl = (...a) => fetch(...a), now = () => Date.now(), timeoutMs = 15_000 }) {
  const tokens = new Map(); // org (lower case) -> { token, expiresAt }

  function checkRepo(repo) {
    if (!REPO_RE.test(String(repo || ''))) throw new GithubError('Not a valid GitHub repository name (owner/repo).', 400);
    const owner = repo.split('/')[0].toLowerCase();
    const orgs = (allowedOrgs() || []).map((o) => o.toLowerCase());
    if (!orgs.includes(owner)) throw new GithubError(`"${repo.split('/')[0]}" is not an allowed GitHub organisation (PIA settings).`, 400);
    return owner;
  }

  async function call(method, apiPath, auth, { accept = 'application/vnd.github+json' } = {}) {
    const url = new URL(apiPath, API);
    if (url.origin !== API) throw new GithubError('Blocked: GitHub requests may only go to api.github.com.', 400);
    if (method !== 'GET' && !/^\/app\/installations\/\d+\/access_tokens$/.test(url.pathname)) throw new GithubError('Blocked: the GitHub client is read-only.', 400);
    let res;
    try {
      res = await fetchImpl(url.toString(), {
        method,
        headers: { Accept: accept, Authorization: `Bearer ${auth}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'cloudstaff-security-issues-analytics' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new GithubError(`GitHub ${method} ${url.pathname} failed: ${err.name === 'TimeoutError' ? 'timed out' : 'network error'}`, 502);
    }
    if (res.headers?.get?.('x-ratelimit-remaining') === '0' && res.status !== 200) throw new GithubError('GitHub rate limit reached; try again later.', 429);
    if (res.status === 404) throw new GithubError(`Not found on GitHub (${url.pathname}). Check the name and that the GitHub App is installed on it.`, 404);
    if (res.status === 401 || res.status === 403) throw new GithubError(`GitHub refused access (HTTP ${res.status}) to ${url.pathname}. Check the App ID, key and installation.`, res.status);
    if (!res.ok) throw new GithubError(`GitHub ${method} ${url.pathname} failed (HTTP ${res.status}).`, 502);
    return res.json();
  }

  async function tokenFor(org) {
    const cached = tokens.get(org);
    if (cached && cached.expiresAt - now() > 5 * 60_000) return cached.token;
    const cred = await getCredential();
    if (!cred?.appId || !cred?.privateKey) throw new GithubError('The GitHub App is not set up yet (PIA settings).', 400);
    let jwt;
    try {
      jwt = appJwt({ appId: cred.appId, privateKey: cred.privateKey, now: now() });
    } catch {
      throw new GithubError('The saved GitHub App private key could not be used. Replace it in PIA settings.', 400);
    }
    const inst = await call('GET', `/orgs/${encodeURIComponent(org)}/installation`, jwt);
    if (!Number.isInteger(inst?.id)) throw new GithubError('GitHub returned no installation for this organisation.', 502);
    const t = await call('POST', `/app/installations/${inst.id}/access_tokens`, jwt);
    if (typeof t?.token !== 'string') throw new GithubError('GitHub returned no installation token.', 502);
    const expiresAt = Date.parse(t.expires_at) || now() + 55 * 60_000;
    tokens.set(org, { token: t.token, expiresAt });
    return t.token;
  }

  const get = async (repo, rest) => call('GET', `/repos/${repo}${rest}`, await tokenFor(checkRepo(repo)));
  const encPath = (p) => String(p).split('/').map(encodeURIComponent).join('/');
  const checkSha = (sha) => {
    if (!SHA_RE.test(String(sha))) throw new GithubError('Unexpected commit id from GitHub.', 502);
    return sha;
  };

  return {
    checkRepo,
    clearTokens: () => tokens.clear(),
    // Confirms the App can reach each allowed org (used by the settings page's "Test" button).
    async test() {
      const out = [];
      for (const org of allowedOrgs() || []) {
        try {
          await tokenFor(org.toLowerCase());
          out.push({ org, ok: true });
        } catch (err) {
          out.push({ org, ok: false, error: err.message });
        }
      }
      return out;
    },
    async repo(repo) {
      const r = await get(repo, '');
      return { fullName: r.full_name, defaultBranch: r.default_branch, private: !!r.private, archived: !!r.archived, htmlUrl: r.html_url };
    },
    async headSha(repo, branch) {
      return checkSha((await get(repo, `/commits/${encodeURIComponent(branch)}`)).sha);
    },
    // Latest commit on the branch at or before `untilIso` (null if the repo had no commits then).
    async commitBefore(repo, branch, untilIso) {
      const list = await get(repo, `/commits?sha=${encodeURIComponent(branch)}&until=${encodeURIComponent(untilIso)}&per_page=1`);
      return Array.isArray(list) && list[0] ? { sha: checkSha(list[0].sha), date: list[0].commit?.committer?.date ?? null } : null;
    },
    async tree(repo, sha) {
      const t = await get(repo, `/git/trees/${checkSha(sha)}?recursive=1`);
      return { truncated: !!t.truncated, entries: (t.tree || []).filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha, size: e.size ?? 0 })) };
    },
    async blob(repo, sha) {
      const b = await get(repo, `/git/blobs/${checkSha(sha)}`);
      return b.encoding === 'base64' ? Buffer.from(b.content || '', 'base64').toString('utf8') : String(b.content || '');
    },
    // File text at a commit, or null if it is missing or too large.
    async fileAt(repo, filePath, ref, maxBytes) {
      let f;
      try {
        f = await get(repo, `/contents/${encPath(filePath)}?ref=${checkSha(ref)}`);
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
      if (Array.isArray(f) || f.type !== 'file' || (maxBytes && f.size > maxBytes) || f.encoding !== 'base64') return null;
      return Buffer.from(f.content || '', 'base64').toString('utf8');
    },
    // Commits and changed files between two commits (GitHub lists at most 300 files).
    async compare(repo, base, head) {
      const c = await get(repo, `/compare/${checkSha(base)}...${checkSha(head)}`);
      return {
        totalCommits: c.total_commits ?? 0,
        files: (c.files || []).map((f) => ({ path: f.filename, status: f.status, previousPath: f.previous_filename || null })),
        truncated: (c.files || []).length >= 300,
      };
    },
  };
}
