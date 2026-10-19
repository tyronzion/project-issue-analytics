import { useEffect, useState } from 'react';

// The shared Target Project List (server: /api/tracker/targets). One copy for the whole page, so a save on
// the Settings page updates the analytics, tracker and PIA pages at once. null = not loaded or unavailable
// (then nothing is filtered).
export interface SharedTargets {
  seeded: boolean;
  seededAt: string | null;
  targetOnly: boolean;
  names: string[];
  entries: { name: string; source: 'seed' | 'admin' | 'roe'; ticketKey: string | null; addedBy: string | null; addedAt: string }[];
  history?: { action: string; name: string | null; changedBy: string | null; changedAt: string }[];
}

const TARGETS_URL = '/api/tracker/targets';
let current: SharedTargets | null = null;
let loading: Promise<SharedTargets | null> | null = null;
const listeners = new Set<(t: SharedTargets | null) => void>();
const publish = (t: SharedTargets | null) => {
  current = t;
  listeners.forEach((fn) => fn(t));
};

export function loadSharedTargets(): Promise<SharedTargets | null> {
  loading ??= fetch(TARGETS_URL)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((t) => {
      loading = null;
      publish(t);
      return t;
    });
  return loading;
}

// Admin only (the server refuses everyone else). seed = first save from this browser's old list.
export async function saveSharedTargets(body: { names?: string[]; targetOnly?: boolean; seed?: boolean }): Promise<SharedTargets> {
  const res = await fetch(TARGETS_URL, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    publish(data);
    return data;
  }
  if (!res.ok) throw new Error(data.error || `Saving the Target Project List failed (${res.status})`);
  publish(data);
  return data;
}

export function useSharedTargets(): SharedTargets | null {
  const [targets, setTargets] = useState<SharedTargets | null>(current);
  useEffect(() => {
    listeners.add(setTargets);
    if (!current) loadSharedTargets();
    return () => {
      listeners.delete(setTargets);
    };
  }, []);
  return targets;
}

// Names to filter by, or null when pages should show everything (list off, not set up, or unavailable).
export function activeTargetNames(t: SharedTargets | null): string[] | null {
  return t && t.seeded && t.targetOnly && t.names.length ? t.names : null;
}
