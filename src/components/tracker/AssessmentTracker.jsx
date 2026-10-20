import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserRound, RefreshCw, CalendarRange, Calendar } from 'lucide-react';
import { FilterSelect } from '../FilterChips';
import { enrich, isDecommissioned } from '../../../tracker/shared/logic.js';
import { targetMatcher } from '../../../tracker/shared/targets.js';
import { useSharedTargets, activeTargetNames } from '../../utils/sharedTargets';
import { loadTrackerApps } from '../../utils/trackerApps';
import { api, getUser, setUser } from './api.js';
import Monitoring from './Monitoring.jsx';
import TimeReport, { PeriodComparison } from './TimeReport.jsx';
import Assessments from './Assessments.jsx';
import Checklist from './Checklist.jsx';
import Decommissioned from './Decommissioned.jsx';
import ImportPage from './ImportPage.jsx';
import SyncPage from './SyncPage.jsx';
import Editor from './Editor.jsx';
import TargetCheck from './TargetCheck.jsx';
import './tracker.css';

const remember = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const recall = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

// The period that contains today, e.g. "2nd Half" in October.
function currentPeriod(cycle) {
  const m = new Date().getMonth();
  return cycle.periods.length === 2 ? cycle.periods[m < 6 ? 0 : 1] : cycle.periods[Math.floor(m / 3)];
}

/**
 * Assessment Tracker (the "Security Full Assessment Tracker" workbook as pages).
 * section: 'monitoring' | 'assessment' | 'time' | 'comparison' | 'checklist' | 'decommissioned' | 'sync' | 'import'
 * sealForProject(name): the app's current Security Seal, or null when unknown / issues still loading.
 * reportIssuesFor(name, asOf?): the app's unresolved issues for the assessment report ({ matched, issues }), now or as
 *   of a date, or null while loading. A resolved ticket's report is frozen at its first download (ReportDialog).
 * When the shared Target Project List's "show only target projects" is on, only apps on it are shown (admins
 * can show all, e.g. to find an app to add). The UberTicket sync page and seal snapshots still see every app.
 */
export default function AssessmentTracker({ section, sealForProject, reportIssuesFor = null, isAdmin = false }) {
  const [cycles, setCycles] = useState(null);
  const [cycleId, setCycleId] = useState(() => Number(recall('assessment_tracker_cycle')) || null);
  const [period, setPeriod] = useState('');
  const [allPeriods, setAllPeriods] = useState(false);
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [user, setUserState] = useState(getUser());
  const [error, setError] = useState('');
  const sealTried = useRef(new Set());
  const targets = useSharedTargets();
  const targetNames = activeTargetNames(targets);
  const [showAll, setShowAll] = useState(false);
  const isShown = useMemo(() => {
    if (!targetNames || showAll) return null;
    const onList = targetMatcher(targetNames);
    return (r) => onList(r.project);
  }, [targetNames, showAll]);

  const cycle = cycles?.find((c) => c.id === cycleId);

  const loadCycles = useCallback(async () => {
    try {
      const list = await api.cycles();
      setCycles(list);
      setCycleId((id) => (list.some((c) => c.id === id) ? id : list[0]?.id ?? null));
    } catch (e) {
      setError(e.message);
      setCycles([]);
    }
  }, []);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  const loadRows = useCallback(() => {
    if (!cycleId) return;
    api.assessments(cycleId).then(setRows).catch((e) => setError(e.message));
  }, [cycleId]);

  useEffect(() => {
    if (!cycleId) return undefined;
    remember('assessment_tracker_cycle', String(cycleId));
    loadRows();
    // Teammates' edits and UberTicket syncs show up without a reload.
    const t = setInterval(loadRows, 60_000);
    return () => clearInterval(t);
  }, [cycleId, loadRows]);

  useEffect(() => {
    if (cycle && !cycle.periods.includes(period)) setPeriod(currentPeriod(cycle));
  }, [cycle, period]);

  const replaceRow = (saved) => setRows((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [...rs, saved]));

  // Seal snapshot: once a ticket is resolved, record the app's Security Seal at that moment.
  useEffect(() => {
    if (!sealForProject) return;
    for (const r of rows) {
      if (r.ticketState !== 'resolved' || !r.ticketKey || r.sealTicketKey === r.ticketKey) continue;
      const tryKey = `${r.id}:${r.ticketKey}`;
      if (sealTried.current.has(tryKey)) continue;
      sealTried.current.add(tryKey);
      const seal = sealForProject(r.project);
      if (seal) api.captureSeal(r.id, seal, r.ticketKey).then(replaceRow).catch(() => {});
    }
  }, [rows, sealForProject]);

  // Decommissioning in the editor hides the app from the analytics pages: refresh their copy of the app list.
  const decomKey = rows.map((r) => `${r.id}:${r.isActive}`).join(',');
  useEffect(() => {
    if (decomKey) loadTrackerApps();
  }, [decomKey]);

  const enriched = useMemo(() => rows.map(enrich), [rows]);
  const shown = useMemo(() => (isShown ? enriched.filter(isShown) : enriched), [enriched, isShown]);
  const hiddenCount = enriched.length - shown.length;
  const active = useMemo(() => shown.filter((r) => !isDecommissioned(r)), [shown]);
  const retired = useMemo(() => shown.filter(isDecommissioned), [shown]);
  const testers = useMemo(() => [...new Set(rows.map((r) => r.securityTester).filter(Boolean))].sort(), [rows]);
  const projects = useMemo(() => [...new Set(rows.map((r) => r.project))].sort((a, b) => a.localeCompare(b)), [rows]);

  async function quickUpdate(row, patch) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    try {
      replaceRow(await api.updateAssessment(row.id, patch));
    } catch (e) {
      setError(e.message);
      loadRows();
    }
  }

  async function addCycle() {
    const track = window.prompt('Track: type "biannual" or "quarterly"', 'biannual');
    if (!track) return;
    const year = Number(window.prompt('Year', String(new Date().getFullYear() + 1)));
    try {
      const { id } = await api.createCycle(track.trim().toLowerCase(), year);
      await loadCycles();
      setCycleId(id);
    } catch (e) {
      setError(e.message);
    }
  }

  const showPeriods = ['monitoring', 'assessment', 'checklist', 'time'].includes(section);
  // Assessment List and Time Report can also show every period of the cycle at once.
  const allowAll = section === 'assessment' || section === 'time';

  return (
    <div className="at-root space-y-4">
      <div className="at-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <h1 className="text-lg font-bold">Assessment Tracker</h1>
        {cycles?.length > 0 && (
          <FilterSelect
            icon={CalendarRange}
            label="Cycle"
            value={String(cycleId ?? '')}
            onChange={(v) => (v === 'new' ? addCycle() : setCycleId(Number(v)))}
            options={[...cycles.map((c) => ({ value: String(c.id), label: `${c.label} (${c.apps})` })), { value: 'new', label: '+ New cycle…' }]}
          />
        )}
        {showPeriods && cycle && (
          <FilterSelect
            icon={Calendar}
            label="Period"
            value={allowAll && allPeriods ? 'all' : period}
            onChange={(v) => {
              setAllPeriods(v === 'all');
              if (v !== 'all') setPeriod(v);
            }}
            options={allowAll ? [...cycle.periods, { value: 'all', label: 'All periods' }] : cycle.periods}
          />
        )}
        <span className="ml-auto text-xs at-muted">{active.length} active · {retired.length} decommissioned</span>
        {targetNames && section !== 'sync' && section !== 'import' && (
          <span className="text-xs at-muted">
            {showAll ? 'All apps' : `Target projects only${hiddenCount ? ` · ${hiddenCount} rows hidden (all periods)` : ''}`}
            {isAdmin && (
              <button type="button" className="at-link ml-1.5" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show target projects only' : 'Show all apps'}
              </button>
            )}
          </span>
        )}
        <button type="button" onClick={loadRows} className="at-btn-ghost" title="Reload">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
        </button>
        <label className="flex items-center gap-1.5 at-muted" title="Your name is recorded in the change history">
          <UserRound className="w-4 h-4" aria-hidden />
          <input
            value={user}
            onChange={(e) => {
              setUserState(e.target.value);
              setUser(e.target.value);
            }}
            placeholder="Your name"
            className="at-input w-32"
          />
        </label>
      </div>

      {targetNames && cycle && ['monitoring', 'assessment', 'checklist'].includes(section) && (
        <TargetCheck targetNames={targetNames} cycle={cycle} cycles={cycles} rows={rows} />
      )}

      {error && (
        <div className="at-alert at-alert--error justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="font-bold">Dismiss</button>
        </div>
      )}

      {cycles && !cycles.length && section !== 'import' && (
        <div className="at-card p-10 text-center at-muted">No assessment data yet. Use <b>Import Excel</b> to load the workbook.</div>
      )}

      {cycle && section === 'monitoring' && <Monitoring rows={active} period={period} onOpen={setEditing} />}
      {cycle && section === 'assessment' && <Assessments rows={active} period={allPeriods ? null : period} onOpen={setEditing} onAdd={() => setEditing({ period })} />}
      {cycle && section === 'time' && (
        <TimeReport rows={active} period={allPeriods ? null : period} scopeLabel={`${cycle.label}, ${allPeriods ? 'all periods' : period}`} onOpen={setEditing} />
      )}
      {cycles?.length > 0 && section === 'comparison' && <PeriodComparison cycles={cycles} isShown={isShown} />}
      {cycle && section === 'checklist' && <Checklist rows={active} period={period} onToggle={quickUpdate} onOpen={setEditing} />}
      {cycle && section === 'decommissioned' && (
        <Decommissioned rows={retired} onOpen={setEditing} onRestore={(r) => quickUpdate(r, { isActive: 'Active', decommissionedAt: null, decommissionReason: null })} />
      )}
      {section === 'sync' && <SyncPage projects={projects} onSynced={loadRows} />}
      {section === 'import' && <ImportPage cycles={cycles || []} onImported={() => loadCycles().then(loadRows)} />}

      {editing && cycle && (
        <Editor
          key={editing.id ?? 'new'}
          row={editing}
          cycleId={cycle.id}
          cycleYear={cycle.year}
          periods={cycle.periods}
          reportIssuesFor={reportIssuesFor}
          isAdmin={isAdmin}
          onReportSaved={replaceRow}
          testers={testers}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            replaceRow(saved);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setRows((rs) => rs.filter((r) => r.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
