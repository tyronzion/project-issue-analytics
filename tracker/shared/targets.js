import { matchKey } from './logic.js';

// Target Project List name matching, shared by the server (Rules of Engagement auto-add) and the UI
// (tracker and PIA pages show only target apps). Platform and filler words are ignored, so the target
// "Doorspace" covers "Doorspace", "Doorspace AOS" and "Doorspace Mobile AOS", and "Payroll" covers
// "Payroll App". Otherwise the same rules as matchKey: case, punctuation and a leading "Cloudstaff".
const NOISE = /\b(ios|aos|android|iphone|mobile|project|app|application)\b/g;
const PLATFORM_TAG = /[[(【]\s*(ios|aos|android|web)\s*[\])】]/g;

export function targetKey(name) {
  const lower = String(name || '').toLowerCase().normalize('NFKD');
  return matchKey(lower.replace(PLATFORM_TAG, ' ').replace(NOISE, ' ')) || matchKey(name);
}

// names: the target list -> (name) => true when that app is on the list.
export function targetMatcher(names) {
  const keys = new Set((names || []).map(targetKey).filter(Boolean));
  return (name) => keys.has(targetKey(name));
}
