import { QUESTIONS } from '../shared/questions.js';

// Answers of an approved [PIA01] policy (GET /v1/policies/{uuid}), matched to the template questions by label.
// Used in memory only, to carry the old answers into the reassessment document: they are never stored (D10, D15).
//
// The policy's form values are { id, label, value } objects (under data.public / data.private, the shape
// monitor/server/fullAssessment.js readField reads). Any nested object with a question-like label and a value
// is considered, so a slightly different layout still works. Unmatched questions stay blank in the document.

const MAX_NODES = 20_000;
const norm = (s) => String(s || '').toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));

export function htmlToText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(htmlToText).filter(Boolean).join('\n');
  if (typeof v === 'object') return htmlToText(v.value ?? v.label ?? v.text ?? v.name ?? '');
  return String(v)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20_000);
}

// Every { label, value } pair in the policy JSON.
export function labelledValues(policy) {
  const out = [];
  let seen = 0;
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12 || ++seen > MAX_NODES) return;
    if (Array.isArray(node)) { for (const x of node) walk(x, depth + 1); return; }
    const label = node.label ?? node.question ?? node.title ?? null;
    if (typeof label === 'string' && label.trim() && ('value' in node || 'answer' in node)) {
      out.push({ id: node.id ?? null, label: label.trim(), value: htmlToText(node.value ?? node.answer) });
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(policy, 0);
  return out;
}

function similarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}

// -> { answers: { [questionId]: text }, matched, total, extra: [{ label, value }] (answered fields not matched) }
export function matchAnswers(policy) {
  const pairs = labelledValues(policy).filter((p) => p.value);
  const answers = {};
  const used = new Set();
  for (const qq of QUESTIONS) {
    const qn = norm(qq.text);
    let best = null, bestScore = 0;
    pairs.forEach((p, i) => {
      if (used.has(i)) return;
      const ln = norm(p.label);
      const s = ln === qn ? 1 : ln.length > 12 && (qn.includes(ln) || ln.includes(qn)) ? 0.9 : similarity(qq.text, p.label);
      if (s > bestScore) { best = i; bestScore = s; }
    });
    if (best != null && bestScore >= 0.6) {
      answers[qq.id] = pairs[best].value;
      used.add(best);
    }
  }
  const extra = pairs.filter((_, i) => !used.has(i)).slice(0, 60);
  return { answers, matched: Object.keys(answers).length, total: QUESTIONS.length, extra };
}
