import { useEffect, useState } from 'react';
import { targetKey } from '../../tracker/shared/targets.js';

// The Assessment Tracker's apps, each as of its latest cycle (server: /api/tracker/apps). The analytics pages
// hide apps decommissioned there. One copy for the whole page; null = not loaded or unavailable (then
// nothing is hidden).
export interface TrackerApp {
  name: string;
  decommissioned: boolean;
  decommissionedAt: string | null;
  decommissionReason: string | null;
  year: number;
}

const APPS_URL = '/api/tracker/apps';
let current: TrackerApp[] | null = null;
const listeners = new Set<(a: TrackerApp[] | null) => void>();
const publish = (a: TrackerApp[] | null) => {
  current = a;
  listeners.forEach(fn => fn(a));
};

export function loadTrackerApps(): Promise<TrackerApp[] | null> {
  return fetch(APPS_URL)
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null)
    .then(apps => {
      if (Array.isArray(apps)) publish(apps);
      return current;
    });
}

export function useTrackerApps(): TrackerApp[] | null {
  const [apps, setApps] = useState<TrackerApp[] | null>(current);
  useEffect(() => {
    listeners.add(setApps);
    if (!current) loadTrackerApps();
    return () => {
      listeners.delete(setApps);
    };
  }, []);
  return apps;
}

// Decommission or restore an app in the tracker (its rows in the latest year it appears in).
export async function setAppDecommissioned(project: string, decommissioned: boolean, reason = ''): Promise<void> {
  const res = await fetch(`${APPS_URL}/decommission`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project, decommissioned, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  publish(data);
}

// Is an analytics project name a decommissioned tracker app? Platform is ignored ("Radio AOS" = "Radio"),
// and an app counts as decommissioned only if every tracker app with that name is.
export function decommissionedMatcher(apps: TrackerApp[] | null): ((projectName: string) => boolean) | null {
  if (!apps) return null;
  const state = new Map<string, boolean>();
  for (const a of apps) {
    const k = targetKey(a.name);
    state.set(k, (state.get(k) ?? true) && a.decommissioned);
  }
  const keys = new Set([...state].filter(([, d]) => d).map(([k]) => k));
  return keys.size ? (name: string) => keys.has(targetKey(name)) : null;
}

// Does the tracker know this app (so it can be decommissioned from the Projects page)?
export function trackerKnows(apps: TrackerApp[] | null, projectName: string): boolean {
  const k = targetKey(projectName);
  return !!apps?.some(a => targetKey(a.name) === k);
}
