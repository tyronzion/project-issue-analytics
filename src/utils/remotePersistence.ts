import { IssueRecord } from '../types';

interface LoadIssuesResponse {
  source?: string;
  configured?: boolean;
  issues?: IssueRecord[];
  error?: string;
}

export async function loadRemoteIssues(): Promise<{ issues: IssueRecord[]; configured: boolean }> {
  const response = await fetch('/api/state/issues');
  const payload = (await response.json()) as LoadIssuesResponse;

  if (!response.ok) {
    throw new Error(String(payload?.error || `Failed to load remote issues (${response.status})`));
  }

  return {
    issues: Array.isArray(payload?.issues) ? payload.issues : [],
    configured: Boolean(payload?.configured),
  };
}

export async function saveRemoteIssues(issues: IssueRecord[]): Promise<void> {
  const response = await fetch('/api/state/issues', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ issues }),
  });

  if (!response.ok) {
    let errorMessage = `Failed to save remote issues (${response.status})`;
    try {
      const payload = (await response.json()) as LoadIssuesResponse;
      if (payload?.error) {
        errorMessage = String(payload.error);
      }
    } catch {
      // Ignore parse errors and keep fallback error message.
    }
    throw new Error(errorMessage);
  }
}
