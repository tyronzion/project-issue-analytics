import { SECTIONS, QUESTIONS } from '../shared/questions.js';

// Content of the yearly PIA reassessment document, as blocks for docx.js. Follows the Cloudstaff "Privacy Impact
// Assessment" template (sections I–VIII, same questions and risk tables), with a reassessment cover page:
// assessment details, the result, what changed, and the checklist of answers a person confirmed.
//
// input:
//   app            { name }
//   policy         the approved policy the answers come from { url, version, approvedOn, approvedBy, riskRating, riskLabel }
//   answers        { [questionId]: text } (from policyAnswers.matchAnswers; may be partial)
//   extra          other answered policy fields not matched to a question (e.g. section VII rows)
//   check          the stored reassessment check { since, repos: [...], questions: [{ id, status, evidenceLines }] }
//   confirmations  { [questionId]: true } questions a person confirmed are still true
//   reviewer, today, lastAssessed ('YYYY-MM-DD')

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
const number = (id) => { const [s, n] = id.split('.'); return `${ROMAN[s]}.${n}`; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (day) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : day || '—';
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function reassessmentBlocks({ app, policy, answers = {}, extra = [], check, confirmations = {}, reviewer, today, lastAssessed }) {
  const byId = new Map((check?.questions || []).map((x) => [x.id, x]));
  const changed = QUESTIONS.filter((q) => byId.get(q.id)?.status === 'changed');
  const manual = QUESTIONS.filter((q) => !q.evidence.length);
  const confirmed = manual.filter((q) => confirmations[q.id]);
  const material = changed.length > 0;
  const incomplete = (check?.repos || []).some((r) => r.error || r.truncated);
  const carried = QUESTIONS.filter((q) => answers[q.id]).length;
  const blocks = [];
  const add = (b) => blocks.push(b);

  // ---- Cover ----
  add({ type: 'title', text: 'Privacy Impact Assessment' });
  add({ type: 'subtitle', text: app.name });
  add({ type: 'p', runs: [{ text: 'ANNUAL REASSESSMENT', bold: true, color: 'brand', size: 18, spacing: 20 }, { text: `   ${longDate(today)}`, color: 'muted', size: 18 }] });

  add({ type: 'kv', rows: [
    ['Application', [{ text: app.name, bold: true }]],
    ['Assessment type', 'Annual reassessment of an approved PIA'],
    ['Reassessed on', longDate(today)],
    ['Reassessed by', reviewer],
    ['Previous assessment', `${longDate(lastAssessed)}${policy?.approvedBy ? `, approved by ${policy.approvedBy}` : ''}`],
    ['Previous PIA', policy ? [{ text: `UberTicket policy${policy.version ? ` (version ${policy.version})` : ''}`, link: policy.url }] : 'Not found'],
    ['Previous overall risk', policy?.riskRating != null ? `${policy.riskRating}${policy.riskLabel ? ` (${policy.riskLabel})` : ` (${riskBand(policy.riskRating)})`}` : '—'],
    ['Repositories checked', check?.repos?.length
      ? check.repos.map((r) => `${r.repo} — ${r.error ? 'check failed' : r.newRepo ? 'created after the last assessment' : `${plural(r.totalCommits, 'commit')} since ${longDate(r.since)}`}`).join('\n')
      : 'None linked'],
  ] });

  add(material
    ? { type: 'callout', tone: 'warning', title: `Result: changes found that affect ${plural(changed.length, 'answer')}`, lines: [
      'The application’s repositories changed in ways that affect the privacy answers below. The answers are carried over from the previous PIA; review and update the highlighted ones before this document is filed.',
    ] }
    : { type: 'callout', tone: 'success', title: 'Result: No material change found', lines: [
      `No privacy-relevant change was found in the application’s repositories since the last assessment on ${longDate(lastAssessed)}: no new personal-data fields, outside services, data stores or privacy controls.`,
      `The answers below are carried over from the previous PIA${policy?.approvedOn ? ` approved on ${longDate(policy.approvedOn)}` : ''}.`,
    ] });
  if (incomplete) add({ type: 'callout', tone: 'danger', title: 'Repository check incomplete', lines: ['Part of the check could not be completed (see Repositories checked). Review those repositories by hand.'] });

  add({ type: 'table', header: true, widths: [34, 22, 22, 22], rows: [
    ['Reassessment at a glance', 'Answers carried over', 'Changed in code', 'Confirmed by reviewer'],
    [[{ text: 'Sections I–VI', bold: true }], `${carried} of ${QUESTIONS.length}`, String(changed.length), `${confirmed.length} of ${manual.length}`],
  ] });

  if (material) {
    add({ type: 'h2', text: 'What changed since the last assessment' });
    add({ type: 'table', header: true, widths: [8, 42, 50], zebra: true, rows: [
      ['#', 'Question', 'Evidence from the repositories'],
      ...changed.map((q) => [number(q.id), q.text, byId.get(q.id).evidenceLines.join('\n')]),
    ] });
  }

  add({ type: 'h2', text: 'Reviewer checklist' });
  add({ type: 'p', runs: [{ text: 'These answers can’t be checked from code. The reviewer confirmed whether each is still accurate.', color: 'muted', size: 18 }] });
  add({ type: 'table', header: true, widths: [8, 70, 22], rows: [
    ['#', 'Question', 'Status'],
    ...manual.map((q) => [number(q.id), q.text, confirmations[q.id] ? [{ text: '✓ Confirmed', bold: true, color: 'success' }] : [{ text: 'To confirm', bold: true, color: 'danger' }]]),
  ] });

  // ---- Sections I–VI ----
  add({ type: 'p', pageBreakBefore: true, runs: [
    { text: 'Tags used below:  ', bold: true, size: 17, color: 'muted' },
    { text: ' CHANGED ', bold: true, size: 15, fill: 'warningSoft' }, { text: ' the repositories changed  ', size: 17, color: 'muted' },
    { text: ' NO CHANGE ', bold: true, size: 15, color: 'success', fill: 'successSoft' }, { text: ' checked in code, unchanged  ', size: 17, color: 'muted' },
    { text: ' CONFIRMED ', bold: true, size: 15, color: 'brand', fill: 'brandSoft' }, { text: ' confirmed by the reviewer  ', size: 17, color: 'muted' },
    { text: ' TO CONFIRM ', bold: true, size: 15, color: 'danger', fill: 'dangerSoft' }, { text: ' not yet confirmed', size: 17, color: 'muted' },
  ] });

  for (const s of SECTIONS) {
    add({ type: 'section', eyebrow: `Section ${s.id}`, text: s.title.replace(/^SECTION [IVX]+ - /, '') });
    let group = null;
    for (const q of QUESTIONS.filter((x) => x.section === s.id)) {
      if (q.group && q.group !== group) { group = q.group; add({ type: 'h2', text: group }); }
      const st = byId.get(q.id);
      const isManual = !q.evidence.length;
      const tag = st?.status === 'changed' ? { text: 'CHANGED', tone: 'warning' }
        : isManual ? (confirmations[q.id] ? { text: 'CONFIRMED', tone: 'brand' } : { text: 'TO CONFIRM', tone: 'danger' })
        : st ? { text: 'NO CHANGE', tone: 'success' } : null;
      add({ type: 'question', number: number(q.id), text: q.text, tag });
      const old = answers[q.id];
      if (old) for (const line of old.split('\n').filter((l) => l.trim())) add({ type: 'bullet', text: line.replace(/^\s*[•\-*]\s*/, '') });
      else add({ type: 'bullet', runs: [{ text: 'No answer found in the previous PIA. Fill this in.', italic: true, color: 'danger' }] });
      if (st?.status === 'changed') {
        add({ type: 'callout', tone: 'warning', title: 'Changed since last assessment', lines: st.evidenceLines });
      } else if (isManual) {
        add({ type: 'note', text: confirmations[q.id] ? `Confirmed still accurate by ${reviewer} on ${longDate(today)}.` : 'Not checked from code: confirm this answer is still accurate.' });
      }
    }
  }

  // ---- Section VII: risk management (Security Team) ----
  add({ type: 'section', pageBreakBefore: true, eyebrow: 'Section VII', text: 'Privacy Risk Management' });
  add({ type: 'callout', tone: 'brand', title: 'Security Team will answer this section', lines: ['A risk is the potential of an incident to harm a data subject or the organisation: unauthorised collection, use, disclosure or access to personal data, loss of its confidentiality, integrity or availability, or processing that breaches data subjects’ rights or the privacy principles (transparency, legitimacy and proportionality).'] });
  add({ type: 'h2', text: 'Impact' });
  add({ type: 'table', header: true, widths: [12, 16, 72], rows: [
    ['Rating', 'Type', 'Description'],
    ['1', 'Low', 'The data subjects will either not be affected or may encounter a few inconveniences, which they will overcome without any problem.'],
    ['2', 'Medium', 'The data subjects may encounter significant inconveniences, which they will be able to overcome despite a few difficulties.'],
    ['3', 'High', 'The data subjects may encounter significant inconveniences, which they should be able to overcome but with serious difficulties.'],
    ['4', 'Critical', 'The data subjects may encounter significant inconveniences, or even irreversible consequences, which they may not overcome.'],
  ] });
  add({ type: 'h2', text: 'Probability' });
  add({ type: 'table', header: true, widths: [12, 16, 72], rows: [
    ['Rating', 'Type', 'Description'],
    ['1', 'Unlikely', 'Not expected, but there is a slight possibility it may occur at some time.'],
    ['2', 'Possible', 'Casual occurrence. It might happen at some time.'],
    ['3', 'Likely', 'Frequent occurrences. There is a strong possibility that it might occur.'],
    ['4', 'Almost certain', 'Very likely. It is expected to occur in most circumstances.'],
  ] });
  add({ type: 'h2', text: 'Threats / vulnerabilities: identified issues' });
  if (extra.length) {
    add({ type: 'p', runs: [{ text: 'From the previous PIA:', color: 'muted', size: 18 }] });
    add({ type: 'table', header: true, widths: [35, 65], zebra: true, rows: [['Field', 'Previous value'], ...extra.map((e) => [e.label, e.value])] });
  }
  if (material) add({ type: 'bullet', runs: [{ text: 'Assess the risk of the changes listed under "What changed since the last assessment".', italic: true }] });
  add({ type: 'bullet', runs: [{ text: 'To be completed by the Security Team.', italic: true, color: 'muted' }] });

  // ---- Section VIII ----
  add({ type: 'section', eyebrow: 'Section VIII', text: 'Recommended Privacy Solutions' });
  add({ type: 'table', header: true, widths: [30, 70], rows: [
    ['Rating (impact × probability)', 'Risk level'],
    ['1', 'Low Risk'], ['2 to 5', 'Medium Risk'], ['6 to 9', 'High Risk'], ['10 to 16', 'Critical Risk'],
  ], fills: [null, [null, 'successSoft'], [null, 'warningSoft'], [null, 'dangerSoft'], [null, 'danger']] });
  add({ type: 'bullet', runs: [{ text: 'To be completed by the Security Team.', italic: true, color: 'muted' }] });

  // ---- Sign-off ----
  add({ type: 'section', eyebrow: 'Sign-off', text: 'Review and approval' });
  add({ type: 'kv', rows: [
    ['Reassessed by', `${reviewer}, ${longDate(today)}`],
    ['Next reassessment due', longDate(nextYear(today))],
  ] });
  add({ type: 'signature', rows: ['Application owner (name, date)', 'Data Security Team (name, date)', 'Data Protection Officer (name, date)'] });
  add({ type: 'spacer' });
  add({ type: 'note', text: `Generated by Security Issues Analytics on ${longDate(today)}. Repository evidence lists file paths and field names only; no source code is copied into this document.` });
  return blocks;
}

const riskBand = (n) => (n <= 1 ? 'Low' : n <= 5 ? 'Medium' : n <= 9 ? 'High' : 'Critical');
function nextYear(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  if (!y) return day;
  const dd = m === 2 && d === 29 ? 28 : d;
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
