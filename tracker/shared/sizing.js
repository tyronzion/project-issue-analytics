import { MAN_HOURS } from './logic.js';

// Web Application Size Calculator.
// Ported from the "CSDATASEC Strike Team - Web Application Size Calculator" workbook (SharePoint, Calculator sheet).
// The size is the tracker's Priority (Critical / High / Medium / Low), which drives MAN_HOURS and POINTS in logic.js.
//
// The workbook model: each factor scores weight x (option index / last index). Its nested IFs are exactly that
// (e.g. Pages 0.025 per step up to 0.25). The total out of 1.0 gives the size: <=25% Low, <=50% Medium, <=75% High,
// otherwise Critical.
//
// The adjusted model (the default here, see DECISIONS D14) keeps the same options, scale and bands, and fixes three things:
// - The workbook's "Users" dropdown (cell B7) was never counted. User base is a standard sizing/impact factor
//   (OWASP Risk Rating "size of threat agent" / "number of users affected"), so it now counts for 10%.
// - Functionality, the most subjective answer, drops from 30% to 25%, and Pages from 25% to 20%, to make room for it.
// - Pages also covers API endpoints, so microservices and APIs (no pages) can be sized.
// - "How many data is being collected?" means the number of input fields (not the kind or sensitivity of the data).

export const SIZE_FACTORS = [
  {
    key: 'functionality',
    label: 'Functionality and features',
    help: 'How complex the application is overall. See the guide below.',
    options: ['None', 'Low Complexity', 'Medium Complexity', 'High Complexity', 'Critical Complexity'],
    weights: { workbook: 0.3, adjusted: 0.25 },
  },
  {
    key: 'pages',
    label: 'Pages, screens or API endpoints',
    help: 'Distinct pages or screens. For an API or microservice, count its endpoints.',
    options: ['None', '1 to 5', '6 to 10', '11 to 20', '21 to 40', '41 to 70', '71 to 100', '101 to 150', '151 to 200', '201 to 300', '301 or more'],
    weights: { workbook: 0.25, adjusted: 0.2 },
  },
  {
    key: 'data',
    label: 'Input fields',
    help: 'How many data input fields the app has (form fields, search boxes, upload fields, editable settings). Count the fields, not the kind of data.',
    options: ['None', '1 to 2', '3 to 5', '6 to 10', '11 to 20', '21 or more'],
    weights: { workbook: 0.2, adjusted: 0.2 },
  },
  {
    key: 'integrations',
    label: 'Integrations',
    help: 'Other applications or third-party services it connects to (APIs, SSO, payment, HRIS).',
    options: ['None', '1 to 2 apps', '3 to 4 apps', '5 to 6 apps', '7 or more apps'],
    weights: { workbook: 0.15, adjusted: 0.15 },
  },
  {
    key: 'roles',
    label: 'User roles',
    help: 'Distinct permission levels (e.g. staff, team lead, admin, client).',
    options: ['None', '1 to 3', '4 to 6', '7 to 9', '10 or more'],
    weights: { workbook: 0.1, adjusted: 0.1 },
  },
  {
    key: 'users',
    label: 'User base',
    help: 'How many people use it. In the workbook this dropdown was not counted.',
    options: ['None', '1 to 1,000', '1,001 to 10,000', '10,001 to 100,000', '100,001 or more'],
    weights: { workbook: 0, adjusted: 0.1 },
  },
];

export const SIZE_MODELS = {
  adjusted: 'Adjusted matrix',
  workbook: 'Strike Team workbook',
};

// Upper bound (inclusive) of each size's band, as a share of the 1.0 total.
export const SIZE_BANDS = [
  { size: 'Low', max: 0.25 },
  { size: 'Medium', max: 0.5 },
  { size: 'High', max: 0.75 },
  { size: 'Critical', max: 1 },
];

// Functionality guide, from the workbook's note on the Functionality cell.
export const COMPLEXITY_GUIDE = {
  'Low Complexity': 'Small in scope: limited functionality, few simple features, minimal user interaction, low impact on the overall system.',
  'Medium Complexity': 'Moderate scope: a range of functions serving several user roles or departments; changes can moderately affect other parts of the system.',
  'High Complexity': 'Extensive: many features, supports critical business operations, many user interactions, integrates with several other applications.',
  'Critical Complexity': 'Integral to core operations: extensive functionality, large user base, deeply integrated with other critical applications; downtime affects business continuity.',
};

// Points one factor earns for an answer. Unanswered or unknown answers score 0 (as a blank cell does in the workbook).
export function factorScore(factor, value, model = 'adjusted') {
  const i = factor.options.indexOf(value);
  if (i < 0) return 0;
  return (factor.weights[model] * i) / (factor.options.length - 1);
}

// Total (0..1) -> size. Rounded first so float noise (0.25000000000000006) can't push a total over a band edge.
export function sizeFromScore(total) {
  const t = Math.round(total * 10000) / 10000;
  return SIZE_BANDS.find((b) => t <= b.max)?.size ?? 'Critical';
}

/**
 * answers: { functionality: 'Low Complexity', pages: '11 to 20', ... }
 * Returns { model, total, size, complete, answered, breakdown: [{ key, label, value, score, max }] }.
 * `complete` is false while a counted factor is unanswered; the size is still computed (unanswered = 0).
 */
export function calculateSize(answers = {}, model = 'adjusted') {
  const counted = SIZE_FACTORS.filter((f) => f.weights[model] > 0);
  const breakdown = counted.map((f) => ({
    key: f.key,
    label: f.label,
    value: f.options.includes(answers[f.key]) ? answers[f.key] : '',
    score: factorScore(f, answers[f.key], model),
    max: f.weights[model],
  }));
  const total = breakdown.reduce((s, b) => s + b.score, 0);
  const answered = breakdown.filter((b) => b.value).length;
  return { model, total, size: sizeFromScore(total), complete: answered === counted.length, answered, breakdown };
}

const pctText = (x) => `${Math.round(x * 1000) / 10}%`;
const ptsText = (x) => `${Math.round(x * 1000) / 10}`;
const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);

// Band range as text, e.g. Medium -> "26-50%".
function bandText(size) {
  const i = SIZE_BANDS.findIndex((b) => b.size === size);
  const lo = i > 0 ? Math.round(SIZE_BANDS[i - 1].max * 100) + 1 : 0;
  return `${lo}-${Math.round(SIZE_BANDS[i].max * 100)}%`;
}

/**
 * Assessment summary ("spiel") explaining why an app got its size, for the assessment notes or report.
 * Plain text; the main drivers are the factors with the most points.
 */
export function sizeSummary(answers = {}, { appName = '', model = 'adjusted' } = {}) {
  const r = calculateSize(answers, model);
  const name = appName.trim() || 'The application';
  const lines = [];
  lines.push(`${name} is sized as ${r.size.toUpperCase()} (score ${pctText(r.total)}; the ${r.size} band is ${bandText(r.size)}).`);

  const ranked = r.breakdown.filter((b) => b.score > 0).sort((a, b) => b.score - a.score || b.max - a.max);
  if (ranked.length) {
    const drivers = ranked.slice(0, 3).map((b) => `${lowerFirst(b.label)} (${b.value}: ${ptsText(b.score)} of ${ptsText(b.max)} points)`);
    lines.push(`The size is driven mainly by ${drivers.length > 1 ? `${drivers.slice(0, -1).join(', ')} and ${drivers.at(-1)}` : drivers[0]}.`);
  }
  const low = r.breakdown.filter((b) => b.value && b.score === 0).map((b) => lowerFirst(b.label));
  if (low.length) lines.push(`It scores nothing for ${low.join(' and ')}.`);

  const func = answers.functionality;
  if (COMPLEXITY_GUIDE[func]) lines.push(`Functionality was rated ${func} (${lowerFirst(COMPLEXITY_GUIDE[func]).replace(/\.$/, '')}).`);

  if (MAN_HOURS[r.size]) lines.push(`Estimated assessment effort for a ${r.size} app: ${MAN_HOURS[r.size]} man-hours.`);
  if (!r.complete) lines.push(`Note: ${r.breakdown.length - r.answered} factor(s) not answered yet; they count as zero.`);

  if (model === 'adjusted') {
    const wb = calculateSize(answers, 'workbook');
    lines.push(
      wb.size === r.size
        ? `The Strike Team workbook gives the same size (${wb.size}, ${pctText(wb.total)}).`
        : `The Strike Team workbook, which does not count user base, gives ${wb.size} (${pctText(wb.total)}).`,
    );
  }

  const inputs = r.breakdown.map((b) => `- ${b.label}: ${b.value || 'not answered'} (${ptsText(b.score)}/${ptsText(b.max)})`);
  return `${lines.join(' ')}\n\nInputs (${SIZE_MODELS[model]}, ${r.breakdown.length} factors):\n${inputs.join('\n')}`;
}
