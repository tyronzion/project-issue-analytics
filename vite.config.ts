import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import {defineConfig, loadEnv} from 'vite';

interface JiraApiConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  filterId: string;
  jql: string;
  severityField: string;
  securityDueDateField: string;
  securityTypeField: string;
}

const DEFAULT_JIRA_SEVERITY_FIELD = 'customfield_10072';
const DEFAULT_JIRA_SECURITY_DUE_DATE_FIELD = 'customfield_10102';
const DEFAULT_JIRA_SECURITY_TYPE_FIELD = 'customfield_10086';
const APP_STATE_ROW_ID = 'default';

let persistencePool: Pool | null = null;
let persistenceInitPromise: Promise<void> | null = null;

function getPersistencePool(): Pool | null {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  const host = String(process.env.DB_HOST || '').trim();
  const port = Number(process.env.DB_PORT || 5432);
  const user = String(process.env.DB_USER || '').trim();
  const password = String(process.env.DB_PASSWORD || '').trim();
  const database = String(process.env.DB_NAME || '').trim();

  const hasConnectionString = Boolean(connectionString);
  const hasDiscreteConfig = Boolean(host && user && database);
  if (!hasConnectionString && !hasDiscreteConfig) {
    return null;
  }

  if (persistencePool) {
    return persistencePool;
  }

  persistencePool = new Pool(
    hasConnectionString
      ? { connectionString }
      : {
          host,
          port,
          user,
          password,
          database,
        }
  );

  return persistencePool;
}

async function ensurePersistenceTable(): Promise<void> {
  const pool = getPersistencePool();
  if (!pool) return;

  if (!persistenceInitPromise) {
    persistenceInitPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id TEXT PRIMARY KEY,
          issues JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(
        `INSERT INTO app_state (id, issues)
         VALUES ($1, '[]'::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [APP_STATE_ROW_ID]
      );
    })();
  }

  await persistenceInitPromise;
}

async function loadPersistedIssues(): Promise<any[] | null> {
  const pool = getPersistencePool();
  if (!pool) return null;

  await ensurePersistenceTable();
  const result = await pool.query('SELECT issues FROM app_state WHERE id = $1 LIMIT 1', [APP_STATE_ROW_ID]);
  const row = result.rows[0];
  if (!row) return [];

  const issues = row.issues;
  return Array.isArray(issues) ? issues : [];
}

async function savePersistedIssues(issues: any[]): Promise<void> {
  const pool = getPersistencePool();
  if (!pool) {
    throw new Error('Database is not configured. Set DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.');
  }

  await ensurePersistenceTable();
  await pool.query(
    `UPDATE app_state
     SET issues = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [APP_STATE_ROW_ID, JSON.stringify(Array.isArray(issues) ? issues : [])]
  );
}

function normalizeJiraConfig(config: Partial<JiraApiConfig>): JiraApiConfig {
  const rawBaseUrl = String(config.baseUrl || '').trim();
  const email = String(config.email || '').trim();
  const apiToken = String(config.apiToken || '').trim();
  const providedFilterId = String(config.filterId || '').trim();
  const jql = String(config.jql || '').trim();
  const severityField = String(config.severityField || DEFAULT_JIRA_SEVERITY_FIELD).trim();
  const securityDueDateField = String(config.securityDueDateField || DEFAULT_JIRA_SECURITY_DUE_DATE_FIELD).trim();
  const securityTypeField = String(config.securityTypeField || DEFAULT_JIRA_SECURITY_TYPE_FIELD).trim();

  let normalizedBaseUrl = rawBaseUrl;
  let inferredFilterId = '';

  try {
    const parsedUrl = new URL(rawBaseUrl);
    normalizedBaseUrl = parsedUrl.origin;
    inferredFilterId = String(parsedUrl.searchParams.get('filter') || parsedUrl.searchParams.get('filterId') || '').trim();
  } catch {
    // Keep raw value; validation happens later.
  }

  return {
    baseUrl: normalizedBaseUrl.replace(/\/$/, ''),
    email,
    apiToken,
    filterId: providedFilterId || inferredFilterId,
    jql,
    severityField,
    securityDueDateField,
    securityTypeField,
  };
}

function createJiraHeaders(email: string, apiToken: string): Record<string, string> {
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

function normalizeJiraFieldValue(value: any): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeJiraFieldValue(item))
      .filter(Boolean)
      .join(', ')
      .trim();
  }

  if (typeof value === 'object') {
    const preferredKeys = ['value', 'name', 'displayName', 'key'];
    for (const key of preferredKeys) {
      const next = normalizeJiraFieldValue((value as Record<string, any>)[key]);
      if (next) return next;
    }
  }

  return '';
}

function pickCustomField(
  fields: Record<string, any>,
  configuredField?: string
): string {
  if (configuredField && fields?.[configuredField] !== undefined && fields?.[configuredField] !== null) {
    return normalizeJiraFieldValue(fields[configuredField]);
  }
  return '';
}

async function loadJiraRowsFromApi(): Promise<Record<string, any>[]> {
  return loadJiraRowsFromConfig({
    baseUrl: process.env.JIRA_BASE_URL || '',
    email: process.env.JIRA_EMAIL || '',
    apiToken: process.env.JIRA_API_TOKEN || '',
    filterId: process.env.JIRA_FILTER_ID || '',
    jql: process.env.JIRA_JQL || '',
    severityField: process.env.JIRA_SEVERITY_FIELD || '',
    securityDueDateField: process.env.JIRA_SECURITY_DUE_DATE_FIELD || '',
    securityTypeField: process.env.JIRA_SECURITY_TYPE_FIELD || '',
  });
}

async function readJsonBody(req: any): Promise<any> {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', (error: any) => reject(error));
  });
}

async function loadJiraRowsFromConfig(config: Partial<JiraApiConfig>): Promise<Record<string, any>[]> {
  const normalized = normalizeJiraConfig(config);
  const baseUrl = normalized.baseUrl;
  const email = normalized.email;
  const apiToken = normalized.apiToken;
  const filterId = normalized.filterId;
  const jql = normalized.jql;
  const severityField = normalized.severityField;
  const securityDueDateField = normalized.securityDueDateField;
  const securityTypeField = normalized.securityTypeField;

  if (!baseUrl || !email || !apiToken || (!filterId && !jql)) {
    return [];
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('Invalid Jira Base URL. Use a full URL like https://your-domain.atlassian.net');
  }

  const headers = createJiraHeaders(email, apiToken);
  const maxResults = 100;
  let startAt = 0;
  let total = 0;
  let nextPageToken = '';
  const allIssues: any[] = [];

  const fields = [
    'summary',
    'status',
    'created',
    'statuscategorychangedate',
    'project',
    'issuetype',
    'priority',
    'assignee',
    'duedate',
    ...(severityField ? [severityField] : []),
    ...(securityDueDateField ? [securityDueDateField] : []),
    ...(securityTypeField ? [securityTypeField] : []),
  ];

  const effectiveJql = filterId ? `filter = ${filterId}` : jql;

  let pageCount = 0;
  while (true) {
    const searchParams = new URLSearchParams({
      jql: effectiveJql,
      maxResults: String(maxResults),
      fields: fields.join(','),
    });
    if (nextPageToken) {
      searchParams.set('nextPageToken', nextPageToken);
    } else {
      searchParams.set('startAt', String(startAt));
    }

    const searchUrl = `${baseUrl}/rest/api/3/search/jql?${searchParams.toString()}`;
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const responseText = await response.text();
      let errorDetails = responseText;
      try {
        const parsed = JSON.parse(responseText);
        const messages = [
          ...(Array.isArray(parsed?.errorMessages) ? parsed.errorMessages : []),
          ...(parsed?.errors ? Object.values(parsed.errors) : []),
        ].filter(Boolean);
        if (messages.length > 0) {
          errorDetails = messages.join(' | ');
        }
      } catch {
        // Keep raw response text when payload is not JSON.
      }

      throw new Error(`Jira API request failed (${response.status}): ${String(errorDetails || 'Unknown error')}`);
    }

    const payload = await response.json();
    const issues = Array.isArray(payload?.issues) ? payload.issues : [];
    total = Number(payload?.total || 0);
    allIssues.push(...issues);

    const returnedToken = String(payload?.nextPageToken || '');
    const isLast = Boolean(payload?.isLast);
    if (returnedToken) {
      nextPageToken = returnedToken;
      pageCount += 1;
      if (pageCount > 500) {
        throw new Error('Jira pagination exceeded safety limit (500 pages).');
      }
      continue;
    }

    startAt += issues.length;

    // Fallback behavior for responses that do not include nextPageToken.
    if (isLast || issues.length === 0) {
      break;
    }

    if (total > 0 && startAt >= total) {
      break;
    }

    if (issues.length < maxResults) {
      break;
    }

    pageCount += 1;
    if (pageCount > 500) {
      throw new Error('Jira pagination exceeded safety limit (500 pages).');
    }
  }

  return allIssues.map((issue: any) => {
    const fields = issue?.fields || {};
    const severityValue = pickCustomField(fields, severityField) || String(fields?.priority?.name || '');
    const securityDueDateValue = pickCustomField(fields, securityDueDateField) || String(fields?.duedate || '');
    const securityTypeValue = pickCustomField(fields, securityTypeField);

    return {
      Summary: String(fields?.summary || ''),
      Key: String(issue?.key || ''),
      Status: String(fields?.status?.name || ''),
      Created: String(fields?.created || ''),
      'Security Due Date': securityDueDateValue,
      Severity: severityValue,
      'Status Category Changed': String(fields?.statuscategorychangedate || fields?.updated || ''),
      Project: String(fields?.project?.name || ''),
      'Issue Type': String(fields?.issuetype?.name || ''),
      'Security Type': securityTypeValue,
      Priority: String(fields?.priority?.name || ''),
      Assignee: String(fields?.assignee?.displayName || ''),
    };
  });
}

function jiraDatasourcePlugin() {
  return {
    name: 'jira-datasource-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/state/issues', async (_req: any, res: any) => {
        try {
          const req = _req;
          const method = String(req?.method || 'GET').toUpperCase();

          if (method === 'GET') {
            const issues = await loadPersistedIssues();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              source: 'postgres',
              configured: issues !== null,
              issues: issues || [],
            }));
            return;
          }

          if (method === 'POST') {
            const payload = await readJsonBody(req);
            const issues = Array.isArray(payload?.issues) ? payload.issues : [];
            await savePersistedIssues(issues);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              source: 'postgres',
              saved: issues.length,
            }));
            return;
          }

          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        } catch (error: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            source: 'postgres',
            error: String(error?.message || error),
          }));
        }
      });

      server.middlewares.use('/api/jira/issues', async (_req: any, res: any) => {
        try {
          const req = _req;
          const isPost = String(req?.method || 'GET').toUpperCase() === 'POST';
          const rows = isPost
            ? await loadJiraRowsFromConfig(await readJsonBody(req))
            : await loadJiraRowsFromApi();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ rows, source: 'jira' }));
        } catch (error: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            rows: [],
            source: 'jira',
            error: String(error?.message || error),
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make .env/.env.local variables available to server middleware via process.env.
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  const certificateDirectory = path.resolve(__dirname, 'certificates');
  const certificatePath = path.join(certificateDirectory, '10.6.64.2.crt');
  const privateKeyPath = path.join(certificateDirectory, '10.6.64.2.key');
  const https = fs.existsSync(certificatePath) && fs.existsSync(privateKeyPath)
    ? {
        cert: fs.readFileSync(certificatePath),
        key: fs.readFileSync(privateKeyPath),
      }
    : undefined;

  return {
    plugins: [react(), tailwindcss(), jiraDatasourcePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      https,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
