import { useEffect, useMemo, useState } from 'react';
import { ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import { targetKey } from '../../../tracker/shared/targets.js';
import { isDecommissioned } from '../../../tracker/shared/logic.js';
import { api } from './api.js';

// The Target Project List as the guide for a cycle: which list apps are in this cycle, on the other track of
// the same year, decommissioned, or missing, and which apps in this cycle aren't on the list. Counted by app
// (platform entries such as "Radio AOS" are the same app as "Radio").
export function listApps(names) {
  const apps = new Map();
  for (const n of names || []) {
    const k = targetKey(n);
    if (k && !apps.has(k)) apps.set(k, n);
  }
  return apps;
}

function Names({ title, names, note }) {
  if (!names.length) return null;
  return (
    <div>
      <div className="text-xs font-bold">{title} ({names.length}){note && <span className="font-normal at-muted"> · {note}</span>}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {names.map((n) => <span key={n} className="at-tag" style={{ color: 'var(--cs-text)', borderColor: 'var(--cs-border)', textTransform: 'none' }}>{n}</span>)}
      </div>
    </div>
  );
}

export default function TargetCheck({ targetNames, cycle, cycles, rows }) {
  const [open, setOpen] = useState(false);
  const [otherRows, setOtherRows] = useState([]);
  const others = useMemo(() => (cycles || []).filter((c) => c.year === cycle.year && c.id !== cycle.id), [cycles, cycle]);

  useEffect(() => {
    let alive = true;
    Promise.all(others.map((c) => api.assessments(c.id).then((rs) => rs.map((r) => ({ ...r, cycleLabel: c.label }))).catch(() => [])))
      .then((lists) => alive && setOtherRows(lists.flat()));
    return () => {
      alive = false;
    };
  }, [others]);

  const check = useMemo(() => {
    const list = listApps(targetNames);
    const keysOf = (rs) => new Set(rs.map((r) => targetKey(r.project)));
    const here = keysOf(rows.filter((r) => !isDecommissioned(r)));
    const elsewhere = new Map();
    for (const r of otherRows) if (!isDecommissioned(r)) elsewhere.set(targetKey(r.project), r.cycleLabel);
    const retired = keysOf([...rows, ...otherRows].filter(isDecommissioned));
    const inCycle = [], otherTrack = [], decommissioned = [], missing = [];
    for (const [k, name] of list) {
      if (here.has(k)) inCycle.push(name);
      else if (elsewhere.has(k)) otherTrack.push(`${name} (${elsewhere.get(k)})`);
      else if (retired.has(k)) decommissioned.push(name);
      else missing.push(name);
    }
    const notOnList = [...new Map(rows.filter((r) => !isDecommissioned(r) && !list.has(targetKey(r.project))).map((r) => [targetKey(r.project), r.project])).values()];
    const sort = (xs) => xs.sort((a, b) => a.localeCompare(b));
    return { entries: (targetNames || []).length, apps: list.size, inCycle, otherTrack: sort(otherTrack), decommissioned: sort(decommissioned), missing: sort(missing), notOnList: sort(notOnList) };
  }, [targetNames, rows, otherRows]);

  const parts = [
    `${check.inCycle.length} in this cycle`,
    check.otherTrack.length && `${check.otherTrack.length} on the other track`,
    check.decommissioned.length && `${check.decommissioned.length} decommissioned`,
    check.missing.length && `${check.missing.length} missing`,
    check.notOnList.length && `${check.notOnList.length} in this cycle but not on the list`,
  ].filter(Boolean);

  return (
    <div className="at-card px-4 py-2.5 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left">
        <ListChecks className="w-4 h-4 at-muted" aria-hidden />
        <b>Target Project List: {check.apps} apps</b>
        <span className="text-xs at-muted">({check.entries} entries, platforms counted once)</span>
        <span className="text-xs at-muted">· {parts.join(' · ')}</span>
        <span className="ml-auto at-link inline-flex items-center gap-0.5 text-xs font-bold">
          {open ? <>Hide <ChevronUp className="w-3.5 h-3.5" aria-hidden /></> : <>Details <ChevronDown className="w-3.5 h-3.5" aria-hidden /></>}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <Names title="Missing from this year" names={check.missing} note="on the list, but no row in any of this year's cycles" />
          <Names title="On the other track" names={check.otherTrack} note="counted in that cycle instead" />
          <Names title="Decommissioned" names={check.decommissioned} />
          <Names title="In this cycle but not on the list" names={check.notOnList} note="hidden while “Target projects only” is on" />
          {!check.missing.length && !check.otherTrack.length && !check.decommissioned.length && !check.notOnList.length && <p className="text-xs at-muted">This cycle matches the list.</p>}
        </div>
      )}
    </div>
  );
}
