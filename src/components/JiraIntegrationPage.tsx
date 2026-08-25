import React, { useMemo, useState } from 'react';
import {
  loadJiraIntegrationProfile,
  saveJiraIntegrationProfile,
  JiraIntegrationProfile,
} from '../utils/storage';

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
  filterId: string;
  jql: string;
  severityField: string;
  securityDueDateField: string;
  securityTypeField: string;
  autoSyncEnabled?: boolean;
}

interface JiraIntegrationPageProps {
  onSync: (credentials: JiraCredentials) => Promise<{ loaded: number; error?: string }>;
  isSyncing: boolean;
}

export const JiraIntegrationPage: React.FC<JiraIntegrationPageProps> = ({ onSync, isSyncing }) => {
  const saved = useMemo(() => loadJiraIntegrationProfile(), []);

  const [baseUrl, setBaseUrl] = useState(saved.baseUrl);
  const [email, setEmail] = useState(saved.email);
  const [apiToken, setApiToken] = useState(saved.apiToken || '');
  const [filterId, setFilterId] = useState(saved.filterId);
  const [jql, setJql] = useState(saved.jql);
  const [severityField, setSeverityField] = useState(saved.severityField);
  const [securityDueDateField, setSecurityDueDateField] = useState(saved.securityDueDateField);
  const [securityTypeField, setSecurityTypeField] = useState(saved.securityTypeField);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(Boolean(saved.autoSyncEnabled));
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  const saveProfile = () => {
    const profile: JiraIntegrationProfile = {
      ...loadJiraIntegrationProfile(),
      baseUrl,
      email,
      apiToken,
      filterId,
      jql,
      severityField,
      securityDueDateField,
      securityTypeField,
      autoSyncEnabled,
    };
    saveJiraIntegrationProfile(profile);
    setStatus({ type: 'success', message: 'Jira profile saved locally in this browser.' });
  };

  React.useEffect(() => {
    const nextProfile: JiraIntegrationProfile = {
      ...loadJiraIntegrationProfile(),
      baseUrl,
      email,
      apiToken,
      filterId,
      jql,
      severityField,
      securityDueDateField,
      securityTypeField,
      autoSyncEnabled,
    };
    saveJiraIntegrationProfile(nextProfile);
  }, [baseUrl, email, apiToken, filterId, jql, severityField, securityDueDateField, securityTypeField, autoSyncEnabled]);

  const handleSync = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: 'idle', message: '' });

    try {
      const result = await onSync({
        baseUrl,
        email,
        apiToken,
        filterId,
        jql,
        severityField,
        securityDueDateField,
        securityTypeField,
        autoSyncEnabled,
      });

      if (result.error) {
        setStatus({ type: 'error', message: result.error });
        return;
      }

      setStatus({ type: 'success', message: `Connected and loaded ${result.loaded} issues from Jira.` });
      const nowIso = new Date().toISOString();
      saveJiraIntegrationProfile({
        ...loadJiraIntegrationProfile(),
        baseUrl,
        email,
        apiToken,
        filterId,
        jql,
        severityField,
        securityDueDateField,
        securityTypeField,
        autoSyncEnabled,
        lastSyncedAt: nowIso,
      });
    } catch (err: any) {
      setStatus({ type: 'error', message: String(err?.message || err) });
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Jira Integration</h2>
        <p className="text-xs text-slate-400 mt-1">
          Connect your Jira account in the frontend, then sync issues directly into this dashboard.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="mb-4 text-[11px] text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          Project matching uses bracket tags in Summary. Example: <span className="text-slate-200">[Uberticket]</span>. Plain text mentions like <span className="text-slate-200">(Uberticket integration)</span> are ignored.
        </div>
        <form onSubmit={handleSync} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-slate-300">Jira Base URL</span>
              <input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://your-domain.atlassian.net"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-[11px] text-slate-500">
                You can paste full Jira filter URLs too. Example: https://your-domain.atlassian.net/issues/?filter=12345
              </p>
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-300">Jira Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-300">Jira API Token</span>
              <input
                type="password"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder="Paste API token"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-300">Filter ID (recommended)</span>
              <input
                value={filterId}
                onChange={e => setFilterId(e.target.value)}
                placeholder="e.g. 12345"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-300">JQL (optional alternative)</span>
              <input
                value={jql}
                onChange={e => setJql(e.target.value)}
                placeholder="project in (...) ORDER BY created DESC"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-300">Severity field key (optional)</span>
              <input
                value={severityField}
                onChange={e => setSeverityField(e.target.value)}
                placeholder="customfield_12345"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-300">Security due date field key (optional)</span>
              <input
                value={securityDueDateField}
                onChange={e => setSecurityDueDateField(e.target.value)}
                placeholder="customfield_67890"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-slate-300">Security type field key (optional)</span>
              <input
                value={securityTypeField}
                onChange={e => setSecurityTypeField(e.target.value)}
                placeholder="customfield_10086"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSyncing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-xs font-semibold transition"
            >
              {isSyncing ? 'Syncing from Jira...' : 'Connect and Sync Jira'}
            </button>

            <button
              type="button"
              onClick={saveProfile}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition"
            >
              Save Profile
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={e => setAutoSyncEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            />
            Auto-sync every 15 minutes while the app is open
          </label>

          {status.message && (
            <div
              className={`text-xs px-3 py-2 rounded-lg border ${
                status.type === 'error'
                  ? 'bg-red-950/40 border-red-800 text-red-300'
                  : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              }`}
            >
              {status.message}
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Jira profile fields are auto-saved locally, including the token for background auto-sync.
          </p>
        </form>
      </div>
    </section>
  );
};
