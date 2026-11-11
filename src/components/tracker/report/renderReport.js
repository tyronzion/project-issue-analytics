// Assessment report as a print-ready HTML page (the browser's "Save as PDF" makes the PDF), or as a Word
// document (downloadWordReport: the same content as a single-file web page Word opens and edits, .doc).
// The content follows the team's Word templates; the layout follows the PIA documents (pia/server/docx.js):
// Cloudstaff logo top right on the cover, title + project subtitle, a label / value card, "SECTION N" eyebrows
// over headings with a brand rule, brand-header tables, the emblem on later pages, and the offices /
// cloudstaff.com / page footer. Every value is escaped; links are written only when http(s).
import { SEVERITY_LABEL, SLA_DAYS, DEFAULT_RECOMMENDATIONS, parseRecommendations, isWebUrl, testingScopeText } from '../../../../tracker/shared/report.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// "2026-09-11" -> "11 September 2026" (the templates' date style).
export function longDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}
const usDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

// The team's Security Seal badges (public/seals/<seal>.png, the images used in the Word templates).
const SEAL_IMAGES = new Set(['secure', 'protected', 'defended', 'vulnerable', 'exposed', 'compromised']);
export function sealBadge(seal) {
  const name = String(seal || '').toLowerCase();
  if (!SEAL_IMAGES.has(name)) return '';
  return `<img class="seal" src="/seals/${name}.png" alt="${esc(seal)} security seal">`;
}

const LOGO = '/design-system/assets/logos/cloudstaff-logo-landscape.svg';
const EMBLEM = '/design-system/assets/logos/cloudstaff-logo-emblem.svg';

const paras = (list) => list.filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
const multiline = (text) => paras(String(text || '').split(/\n{2,}/).map((p) => p.trim()));
const link = (url, label) => (isWebUrl(url) ? `<a href="${esc(url)}">${esc(label)}</a>` : '<span class="muted">Not provided</span>');

// PIA-style section heading: a small "SECTION I" eyebrow over the heading, with a brand rule under it.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
function sections() {
  let n = 0;
  return (title, eyebrow) => {
    const label = eyebrow || `Section ${ROMAN[n] || n + 1}`;
    if (!eyebrow) n += 1;
    return `<p class="eyebrow">${esc(label)}</p><h2 class="section">${esc(title)}</h2>`;
  };
}

function severityTable(r) {
  const cols = ['informational', 'low', 'medium', 'high', 'critical'];
  return `<table class="grid center">
    <thead><tr><th colspan="5" class="band">Issues With Severity</th></tr>
    <tr>${cols.map((c) => `<th class="sub">${SEVERITY_LABEL[c]}</th>`).join('')}</tr></thead>
    <tbody><tr>${cols.map((c) => `<td>${r.bySeverity[c]}</td>`).join('')}</tr></tbody></table>`;
}

function countsTable(r) {
  return `<table class="grid center">
    <thead><tr><th>New Issues</th><th>Backlog Issues</th><th>Overdue Issues</th><th>Total Unresolved Issues</th></tr></thead>
    <tbody><tr><td>${r.counts.new}</td><td>${r.counts.backlog}</td><td>${r.counts.overdue}</td><td>${r.counts.unresolved}</td></tr></tbody></table>`;
}

// Jira issue link for a key like "RRP-11415", when the Jira site is known.
const KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;
function issueLink(key, jiraBase) {
  const label = esc(key);
  return jiraBase && isWebUrl(jiraBase) && KEY_RE.test(key) ? `<a href="${esc(`${jiraBase.replace(/\/+$/, '')}/browse/${key}`)}">${label}</a>` : label;
}

function issueTable(r, caption, jiraBase) {
  if (!r.rows.length) {
    // RoE is usually the app's first test, so "unresolved" would read oddly there.
    const none = r.kind === 'roe' ? 'No security issues were found during this assessment.' : 'There are no new or backlog issues for this application.';
    return `<p class="muted center">${none}</p>`;
  }
  const body = r.rows.map((i) => `<tr>
      <td class="nowrap${i.overdue ? ' overdue' : ''}">${issueLink(i.key, jiraBase)}${i.overdue ? '*' : ''}</td>
      <td>${esc(i.summary)}</td>
      <td class="nowrap">${esc(longDate(i.dueDate))}</td>
      <td class="nowrap">${i.type}</td>
      <td class="nowrap">${i.severity ? SEVERITY_LABEL[i.severity] : '—'}</td>
    </tr>`).join('');
  return `<p class="caption"><b>Issue Summary Table:</b> ${esc(caption)}</p>
    <table class="grid issues">
    <thead><tr><th>Issue Key</th><th>Summary</th><th>Due Date</th><th>Type</th><th>Severity</th></tr></thead>
    <tbody>${body}</tbody></table>
    ${r.counts.overdue ? '<p class="note"><b>Note:</b> <i>* Issue keys that are highlighted are past their due dates.</i></p>' : ''}`;
}

function artifacts(r, sec, scanLabel, dashLabel) {
  return `${sec('Artifacts')}
    <table class="grid">
      <thead><tr><th>Description</th><th>Links</th></tr></thead>
      <tbody>
        <tr><td>${esc(scanLabel)}</td><td>${link(r.info.scanResultsUrl, 'Scan Results')}</td></tr>
        <tr><td>${esc(dashLabel)}</td><td>${link(r.info.dashboardUrl, 'Security Dashboard')}</td></tr>
      </tbody>
    </table>`;
}

// Cover, as the PIA documents: logo top right, title, project subtitle, eyebrow, then a label / value card.
function header(r) {
  const dates = r.start ? `${longDate(r.start)} – ${longDate(r.end)}` : longDate(r.end);
  const seal = r.seal ? `<span class="seal-cell">${sealBadge(r.seal)}<b>${esc(r.seal)}</b></span>` : '—';
  return `<header class="cover"><img class="logo" src="${LOGO}" alt="Cloudstaff"></header>
    <h1>${esc(r.title)}</h1>
    <div class="subtitle">${esc(r.project)}</div>
    <p class="eyebrow cover-eyebrow">${esc(r.kind === 'roe' ? 'Rules of Engagement — Summary Report' : 'Security Full Assessment — Report')}</p>
    <table class="grid kv">
      <tr><th>Project or Product</th><td>${esc(r.project)}</td></tr>
      ${r.period ? `<tr><th>Assessment period</th><td>${esc(r.period)}</td></tr>` : ''}
      <tr><th>Assessment dates</th><td>${esc(dates)}</td></tr>
      <tr><th>Assessed by</th><td>Cloudstaff Data Security Team (CSDATASEC)</td></tr>
      <tr><th>Security Seal</th><td>${seal}</td></tr>
    </table>`;
}

function fullReport(r, jiraBase) {
  const sec = sections();
  return `${header(r)}
    ${r.info.intro ? `${sec('Introduction')}${multiline(r.info.intro)}` : ''}
    ${sec('Summary of Findings')}
    ${paras(r.sealText.slice(0, 1))}
    ${countsTable(r)}
    ${severityTable(r)}
    ${issueTable(r, "Detailed information regarding the application's issues can be found in the table below:", jiraBase)}
    ${sec('Security Advisory')}
    ${paras(r.advisory)}
    ${paras(r.sealText.slice(1))}
    ${r.info.notes ? multiline(r.info.notes) : ''}
    ${artifacts(r, sec, 'Compilation Security Testing Scan Results', 'Security Dashboard')}`;
}

function roeReport(r, jiraBase) {
  const sec = sections();
  const type = r.info.testingType || 'Blackbox';
  const scope = testingScopeText(r.info);
  const recs = parseRecommendations(r.info.recommendations);
  const recommendations = recs.length ? recs : DEFAULT_RECOMMENDATIONS;
  const targetUrl = String(r.testingUrl || '').split(/\s+/).filter(Boolean).join('\n');
  return `${header(r)}
    ${r.info.intro ? `${sec('Introduction')}${multiline(r.info.intro)}` : ''}
    ${sec('Summary of Findings')}
    <p>${esc(r.findings)} ${r.rows.length ? 'We recommend addressing them within their SLA.' : 'We recommend that you maintain the integrity of your product.'} If you have any questions, feel free to contact us.</p>
    ${paras(r.sealText.slice(0, 1))}
    ${severityTable(r)}
    ${issueTable(r, 'Detailed information regarding the current and backlog application issues can be found in the table below:', jiraBase)}
    ${sec('Overview')}
    <p>Cloudstaff Data Security (CSDATASEC) conducted a ${esc(type.toLowerCase())} security assessment of ${esc(r.project)} to evaluate potential security risks. The objective was to identify vulnerabilities and weaknesses that could affect the application, its users, and their data.</p>
    <p>During the engagement, CSDATASEC used configuration analysis and security tools to simulate real-world attack scenarios. The assessment focused on identifying insecure coding practices, logic flaws, misconfigurations, and behavioral anomalies.</p>
    <p>This report outlines the key findings and recommendations from the assessment, presented in a way that is accessible to a non-technical audience while preserving technical accuracy.</p>
    <table class="grid kv">
      <tr><th>Security Start Date</th><td>${esc(usDate(r.start))}</td></tr>
      <tr><th>Security End Date</th><td>${esc(usDate(r.end))}</td></tr>
      <tr><th>Target URL</th><td class="pre">${esc(targetUrl || '—')}</td></tr>
      <tr><th>Type of Testing</th><td>${esc(type)}</td></tr>
      <tr><th>Time of Testing</th><td>${esc(r.info.testingTime || '—')}</td></tr>
    </table>
    ${sec('Scope and Limitations')}
    <p>The security assessment was limited to the ${esc(r.project)} application and was conducted using ${esc(type.toLowerCase())} testing techniques.${scope ? ` ${esc(scope)}` : ''}</p>
    <p>The following activities were explicitly excluded from the scope:</p>
    <ul>
      <li>Internal network-based penetration testing</li>
      <li>Active exploitation or invasive testing techniques on production systems</li>
      <li>Introduction of malicious code (e.g., Trojans, worms, or viruses)</li>
      <li>Changes to assigned user passwords</li>
      <li>Modification of user files or system files</li>
    </ul>
    <p>All testing activities were carefully designed to avoid disrupting the live production environment and to ensure that production stability and data integrity were not compromised.</p>
    ${sec('Assessment Overview')}
    <div class="phases"><span>Pre-Engagement</span><span>Reconnaissance</span><span>Exploitation</span><span>Reporting</span></div>
    <p>Security testing includes several phases aimed at verifying a system's strength and resilience against potential threats. The following phases were part of the security testing process:</p>
    <ul>
      <li><b>Pre-Engagement</b> – the initial phase, in which the objectives, scope, and requirements of the testing process are defined and agreed upon between the testing team and the client.</li>
      <li><b>Reconnaissance</b> – the phase of gathering information and intelligence about the target system to better understand its architecture and potential vulnerabilities.</li>
      <li><b>Exploitation</b> – the phase of actively exploiting identified vulnerabilities to assess their impact and potential risks.</li>
      <li><b>Reporting</b> – the phase of documenting and communicating the findings, results, and recommendations of the testing to stakeholders.</li>
    </ul>
    ${sec('Areas Assessed')}
    <p>During the assessment, the following areas were specifically checked for security vulnerabilities:</p>
    <ul>
      <li><b>Network communication security</b> (encryption, protocol enforcement, and secure session handling)</li>
      <li><b>Dependency and library security checks</b> (outdated or vulnerable third-party components)</li>
      <li><b>Compliance with secure coding practices</b> (adherence to OWASP and industry best practices)</li>
      <li><b>Authentication and session management implementation</b> (proper token handling, logout behavior, and session invalidation)</li>
      <li><b>Access control and authorization logic</b> (enforcement of least privilege and prevention of privilege escalation)</li>
      <li><b>Configuration and deployment security</b> (review of security-related application and server configurations)</li>
      <li><b>Error handling and logging mechanisms</b> (ensuring sensitive data is not exposed through logs or error messages)</li>
    </ul>
    ${sec('Best Practices and Recommendations')}
    <p>To improve the security of the ${esc(r.project)} application, the following actions are recommended:</p>
    <ul class="recs">${recommendations.map((x) => `<li><b>${esc(x.title)}</b>${x.text ? `<br>${esc(x.text)}` : ''}</li>`).join('')}</ul>
    ${r.info.notes ? multiline(r.info.notes) : ''}
    ${paras(r.sealText.slice(1))}
    ${artifacts(r, sec, 'Compilation of Rules of Engagement Scan Results', `${r.project} Security Dashboard`)}
    ${appendices(sec)}`;
}

function appendices(sec) {
  const qa = (rows) => `<table class="grid qa"><thead><tr><th>Questions</th><th>Answers</th></tr></thead><tbody>${rows.map(([q, a]) => `<tr><th>${esc(q)}</th><td>${a}</td></tr>`).join('')}</tbody></table>`;
  return `${sec('Appendices', 'Appendix')}
    <p>This section includes frequently asked questions about the SLA and the Security Seal.</p>
    <h3>Appendix A – SLA</h3>
    <p>The list below covers frequently asked questions about the SLA.</p>
    ${qa([
      ['What is the SLA for each severity?', Object.entries(SLA_DAYS).map(([s, d]) => `${s} – ${d} days`).join('<br>')],
      ['What are SLAs for security vulnerabilities, and why do we have them?', 'SLAs, or Service Level Agreements, are predefined timeframes within which security vulnerabilities are addressed based on their severity. These SLAs ensure a structured and timely approach to identifying and mitigating potential risks to our systems and data.'],
      ['How were the specific SLA timeframes determined?', 'The SLA timeframes were established after careful consideration of factors such as potential impact, feasibility, flexibility, and resource allocation. They are designed to strike a balance between addressing vulnerabilities promptly and maintaining the quality of fixes.'],
      ['Can we deviate from the established SLAs?', 'While we encourage adherence to the established SLAs, we understand that some cases might require flexibility. If you believe that a particular situation warrants a deviation, please contact the Data Security Team to discuss the rationale and potential adjustments.'],
      ["What's the significance of the different severity levels in the SLAs?", 'The severity levels (Low, Medium, High, Critical) reflect the potential impact of a vulnerability. Shorter SLAs for higher severity levels (e.g., Critical) emphasize the urgency of addressing vulnerabilities that could have a significant impact on our security.'],
      ["How does adhering to SLAs benefit Cloudstaff?", 'Adhering to SLAs provides several benefits, including consistent security practices, effective risk management, compliance with regulations, business continuity, and building trust with stakeholders. It also encourages the ongoing improvement of our security processes.'],
      ['How can we manage our development roadmap while adhering to SLAs?', "The SLAs were designed to be feasible within our development and resource constraints. We've considered the impact on our development roadmap and believe that these SLAs strike a reasonable balance between addressing vulnerabilities and ongoing development."],
      ['What are the consequences of not meeting an SLA?', "Although falling short of an SLA is not the desired outcome, it's crucial to promptly notify the Data Security Team if such a situation arises. In the event of a missed SLA, the circumstances surrounding it will be thoroughly assessed. Subsequent actions will prioritize addressing the vulnerability as swiftly as possible while minimizing any potential security implications.<br>In case of a missed SLA, the matter will be escalated to both the Manager of the development team and the Tribe Leads for further review and coordination."],
      ['Who is responsible for evaluating the severity levels in the SLAs?', "The responsibility for assessing severity levels within the SLAs lies with the Data Security Team. They employ established risk assessment tools such as the OWASP Risk Calculator and the CVSS Risk Calculator, ensuring a comprehensive and standardized evaluation, not only internally but also beyond the company's boundaries."],
    ])}
    <h3>Appendix B – Security Seal</h3>
    <p>The list below covers frequently asked questions about the Security Seal.</p>
    ${qa([
      ['What is the purpose of a Security Seal?', 'A seal indicates the current state of an application in terms of its security measures. It also reflects how penetrable an app is with its current vulnerabilities.'],
      ['How does a Security Seal work?', `The product's Security Seal score depends on the number of outstanding security issues, including new and backlog issues:<br>${sealGuide()}`],
      ['How do I achieve a Secure rating in the Security Seal?', 'The Data Security Team conducts a full assessment every quarter of the year for each product. To achieve a Secure rating, the full assessment must find no more than 15 low and 15 medium severity issues, and no high or critical severity issues, including new and backlog issues. All issues need to be fixed in the staging, UAT, and production environments.'],
    ])}
    <h3>Appendix C – Definition of Terms</h3>
    <p>This section describes the security terms mentioned in this document:</p>
    <table class="grid qa"><thead><tr><th>Terms</th><th>Description</th></tr></thead><tbody>
      <tr><th>Black-box Penetration Testing</th><td>Black-box penetration testing assesses system security without any knowledge of its internal architecture or source code. It simulates an external attacker and focuses on the application's exposed functionality, interfaces, and behavior.</td></tr>
      <tr><th>Gray-box Penetration Testing</th><td>Gray-box penetration testing assesses system security with partial knowledge of its internal architecture, such as user accounts, roles, and design or API documentation. It combines an external attacker's perspective with authenticated access to uncover flaws in access controls, business logic, and data handling.</td></tr>
      <tr><th>White-box Penetration Testing</th><td>White-box penetration testing assesses system security with full knowledge of its internal architecture and source code. This method simulates insider threats and uncovers deep-seated vulnerabilities such as logic flaws and improper access controls. It requires specialized skills and collaboration with developers for a thorough assessment, using tools such as static and dynamic code analysis and manual review.</td></tr>
      <tr><th>Security Posture</th><td>The overall security strength and preparedness of an organization or system. It encompasses the policies, procedures, technologies, and practices implemented to protect against security threats.</td></tr>
    </tbody></table>`;
}

function sealGuide() {
  const rows = [
    ['Secure', '≤ 15', '≤ 15', '0', '0'],
    ['Protected', '≤ 30', '≤ 30', '0', '0'],
    ['Defended', '≤ 50', '≤ 50', '≤ 30', '0'],
    ['Vulnerable', '≤ 50', '≤ 50', '≤ 50', '0'],
    ['Exposed', '≤ 50', '≤ 50', '≤ 50', '≤ 50'],
    ['Compromised', '51+ in any severity', '', '', ''],
  ];
  return `<table class="guide"><thead><tr><th>Seal</th><th>Low</th><th>Medium</th><th>High</th><th>Critical</th></tr></thead><tbody>${rows
    .map(([s, ...c]) => (c[1] === '' ? `<tr><td><b>${s}</b></td><td colspan="4">${c[0]}</td></tr>` : `<tr><td><b>${s}</b></td>${c.map((x) => `<td>${x}</td>`).join('')}</tr>`))
    .join('')}</tbody></table>`;
}

// Footer text, as the PIA documents (offices · cloudstaff.com · page).
const OFFICES = 'US  |  UK  |  AUSTRALIA  |  PHILIPPINES  |  INDIA';

const STYLES = `
  /* The footer (offices, cloudstaff.com, Page N of M) is drawn in the bottom page margin by @page margin boxes.
     Defining them also stops Chrome printing its own header/footer (title, URL, date). The top margin is 0:
     the frame's thead spacer below repeats on every printed page and holds the emblem. */
  @page {
    size: A4; margin: 0 18mm 16mm;
    @bottom-left { content: "${OFFICES}"; white-space: pre; font-family: var(--font-family-body); font-size: 7.5pt; color: var(--color-text-base-muted); vertical-align: top; padding-top: 3mm; border-top: 0.5pt solid var(--color-border-subtle); }
    @bottom-center { content: "cloudstaff.com"; font-family: var(--font-family-body); font-size: 7.5pt; font-weight: 700; color: var(--color-brand-primary); text-decoration: underline; vertical-align: top; padding-top: 3mm; border-top: 0.5pt solid var(--color-border-subtle); }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: var(--font-family-body); font-size: 7.5pt; color: var(--color-text-base-muted); vertical-align: top; padding-top: 3mm; border-top: 0.5pt solid var(--color-border-subtle); }
  }
  * { box-sizing: border-box; }
  html, body { background: var(--color-surface-canvas); }
  body { margin: 0; font-family: var(--font-family-body); color: var(--color-text-base-primary); font-size: 10pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main { max-width: 174mm; margin: 0 auto; padding: 24px 0 48px; }
  h1 { font-family: var(--font-family-heading); font-weight: 700; font-size: 28pt; line-height: 1.15; margin: 10px 0 6px; }
  .subtitle { font-family: var(--font-family-heading); color: var(--color-brand-primary); font-size: 18pt; font-weight: 300; margin-bottom: 18px; }
  .eyebrow { font-family: var(--font-family-body); color: var(--color-brand-primary); font-size: 8.5pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin: 26px 0 2px; text-align: left; break-after: avoid; }
  .cover-eyebrow { margin: 0 0 8px; letter-spacing: 0.02em; }
  h2 { font-family: var(--font-family-heading); font-weight: 700; font-size: 15pt; line-height: 1.3; margin: 22px 0 10px; break-after: avoid; }
  h2.section { margin-top: 0; padding-bottom: 6px; border-bottom: 2px solid var(--color-brand-primary); }
  h3 { font-family: var(--font-family-heading); font-weight: 700; font-size: 12pt; margin: 18px 0 6px; break-after: avoid; }
  p { margin: 0 0 8px; text-align: justify; }
  ul { margin: 4px 0 10px; padding-left: 22px; } li { margin-bottom: 4px; }
  li::marker { color: var(--color-brand-primary); }
  a { color: var(--color-brand-primary); font-weight: 700; }
  .cover { display: flex; justify-content: flex-end; }
  .logo { height: 40px; }
  .seal { height: 64px; width: auto; }
  .seal-cell { display: inline-flex; align-items: center; gap: 10px; }
  .seal-cell .seal { height: 44px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; break-inside: auto; }
  /* Keep data-table rows whole, but never the frame row that holds the whole report: Chrome would push
     the report to page 2 to avoid splitting it. */
  .grid tr, .guide tr { break-inside: avoid; }
  .frame > tbody > tr, .frame > tbody > tr > td { break-inside: auto; }
  /* Long Q&A answers may split across pages, so a tall row doesn't leave a blank gap at the page bottom. */
  .qa tr { break-inside: auto; }
  .grid th, .grid td { border: 1px solid var(--color-border-subtle); padding: 6px 9px; vertical-align: top; text-align: left; font-size: 9.5pt; }
  /* PIA tables: brand header row with white text. */
  .grid thead th { background: var(--color-brand-primary); color: var(--color-brand-primary-contrast); font-weight: 700; vertical-align: middle; }
  .grid thead th.sub { background: var(--color-brand-primary-soft); color: var(--color-text-base-primary); }
  .center td, .center th { text-align: center; }
  .issues td:nth-child(n+3) { text-align: center; }
  .issues td.overdue { color: var(--color-feedback-danger, var(--color-text-base-primary)); font-weight: 700; }
  .issues td a { color: inherit; font-weight: inherit; text-decoration: underline; text-underline-offset: 2px; }
  /* PIA label / value card: shaded, muted bold labels. */
  .kv th { width: 32%; background: var(--color-surface-secondary); color: var(--color-text-base-muted); font-weight: 700; }
  .kv th, .kv td { vertical-align: middle; }
  .qa tbody th { width: 34%; background: var(--color-surface-secondary); font-weight: 700; }
  .qa td { text-align: justify; }
  .guide { width: auto; margin: 6px 0 0; font-size: 9pt; } .guide th, .guide td { border: 1px solid var(--color-border-subtle); padding: 2px 6px; text-align: center; }
  .guide thead th { background: var(--color-surface-secondary); color: var(--color-text-base-primary); }
  .pre { white-space: pre-line; word-break: break-all; }
  .nowrap { white-space: nowrap; }
  .muted { color: var(--color-text-base-muted); }
  p.center { text-align: center; }
  .caption { margin-top: 12px; text-align: left; }
  .note { font-size: 9pt; color: var(--color-text-base-muted); }
  .phases { display: flex; gap: 8px; margin: 8px 0 12px; }
  .phases span { flex: 1; text-align: center; padding: 7px 4px; border-radius: var(--radius-sm, 6px); background: var(--color-brand-primary); color: var(--color-brand-primary-contrast); font-weight: 700; font-size: 9pt; }
  .recs li { margin-bottom: 6px; }
  .frame { width: 100%; border-collapse: collapse; margin: 0; }
  .frame > thead > tr > td, .frame > tfoot > tr > td, .frame > tbody > tr > td { padding: 0; border: 0; }
  .frame-space { height: 0; }
  .page-head { display: none; }
  .screen-footer { display: flex; justify-content: space-between; align-items: center; font-size: 7.5pt; color: var(--color-text-base-muted); max-width: 174mm; margin: 32px auto 24px; padding-top: 8px; border-top: 1px solid var(--color-border-subtle); }
  .screen-footer a { color: var(--color-brand-primary); }
  .toolbar { position: sticky; top: 0; z-index: 1; display: flex; gap: 12px; align-items: center; justify-content: center; padding: 10px; background: var(--color-surface-secondary); border-bottom: 1px solid var(--color-border-primary); font-size: 10pt; }
  main[contenteditable="true"] { outline: 2px dashed var(--color-brand-primary); outline-offset: 8px; }
  .toolbar button { font: inherit; font-weight: 700; padding: 6px 14px; border-radius: var(--radius-sm, 6px); border: 0; background: var(--color-brand-primary); color: var(--color-brand-primary-contrast); cursor: pointer; }
  .toolbar button.secondary { background: var(--color-surface-canvas); color: var(--color-brand-primary); box-shadow: inset 0 0 0 1px var(--color-brand-primary); }
  @media print {
    main[contenteditable="true"] { outline: none; }
    html, body { background: none; }
    .toolbar, .screen-footer { display: none; }
    main { padding: 0; max-width: none; }
    /* Pages 2+: the Cloudstaff emblem at the top left (the thead repeats on every printed page). On page 1
       the cover is pulled up over it, so page 1 shows the landscape logo top right instead. */
    .frame-space.top { height: 30mm; }
    .page-head { display: flex; align-items: flex-end; height: 30mm; padding-bottom: 6mm; }
    .page-head .emblem { height: 12mm; width: 12mm; }
    .cover { position: relative; z-index: 1; background: var(--color-surface-canvas); margin: -30mm 0 0; padding: 12mm 0 0; min-height: 34mm; }
  }
`;

const reportBody = (r, jiraBase) => (r.kind === 'roe' ? roeReport(r, jiraBase) : fullReport(r, jiraBase));

// The whole report page. fileName becomes the document title, which the browser uses as the PDF name.
export function renderReport(r, fileName, { jiraBase = '' } = {}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fileName)}</title>
<link rel="stylesheet" href="/design-system/fonts/fonts.css">
<link rel="stylesheet" href="/design-system/css/tokens.css">
<style>${STYLES}</style></head>
<body>
<div class="toolbar"><span id="edit-hint">Preview. Check the report, edit text if needed, then save. In the print dialog choose <b>Save as PDF</b>.</span><button type="button" id="edit-report" class="secondary" aria-pressed="false">Edit text</button><button type="button" id="print-report">Save as PDF</button><button type="button" id="word-report" class="secondary">Download Word</button></div>
<table class="frame"><thead><tr><td><div class="frame-space top"><div class="page-head"><img class="emblem" src="${EMBLEM}" alt="Cloudstaff"></div></div></td></tr></thead>
<tbody><tr><td>
<main>
${reportBody(r, jiraBase)}
</main>
</td></tr></tbody></table>
<div class="screen-footer"><span>${OFFICES.replace(/ /g, '&nbsp;')}</span><a href="https://www.cloudstaff.com">cloudstaff.com</a></div>
</body></html>`;
}

// Opens a tab now (must run inside the click, or pop-up blockers stop it) and fills it later.
export function openReportTab() {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;padding:24px">Preparing the report…</p>');
  return w;
}

// Shows the report as a preview. Nothing prints until the user clicks Save as PDF, so they can read it and
// fix wording first ("Edit text" makes the report editable in this tab only; edits aren't saved to the
// tracker). "Download Word" exports what the tab shows, including those edits.
export function showReport(w, r, fileName, options) {
  w.document.open();
  w.document.write(renderReport(r, fileName, options));
  w.document.close();
  const doc = w.document;
  const main = doc.querySelector('main');
  const editBtn = doc.getElementById('edit-report');
  const setEditing = (on) => {
    main.contentEditable = on ? 'true' : 'false';
    editBtn.textContent = on ? 'Done editing' : 'Edit text';
    editBtn.setAttribute('aria-pressed', String(on));
    doc.getElementById('edit-hint').innerHTML = on
      ? 'Editing: click any text to change it. Changes apply to this download only and are not saved to the tracker.'
      : 'Preview. Check the report, edit text if needed, then save. In the print dialog choose <b>Save as PDF</b>.';
  };
  editBtn?.addEventListener('click', () => setEditing(main.contentEditable !== 'true'));
  // Print once the brand fonts and images have loaded, so the PDF uses them.
  const ready = () => Promise.all([doc.fonts?.ready, ...[...doc.images].map((img) => (img.complete ? null : new Promise((res) => { img.onload = img.onerror = res; })))]);
  doc.getElementById('print-report')?.addEventListener('click', () => {
    setEditing(false);
    ready().then(() => w.print());
  });
  const wordBtn = doc.getElementById('word-report');
  wordBtn?.addEventListener('click', async () => {
    setEditing(false);
    wordBtn.disabled = true;
    try {
      await downloadWordReport(r, fileName, { ...options, bodyHtml: main.innerHTML });
    } catch (e) {
      w.alert(`Word download failed: ${e.message}`);
    } finally {
      wordBtn.disabled = false;
    }
  });
}

// ---- Word document ---------------------------------------------------------------------------------------
// Word can't read CSS variables, flexbox or SVG, so the Word copy uses simpler styles with the design-system
// tokens resolved to their (light theme) values (brand-soft and border-subtle are color-mix values, which Word can't
// read, so the Word copy uses the secondary surface and the primary border instead), tables for the cover and phases, and PNG images.
// It is an MHTML "single file web page": Word opens it as a normal, editable document.

const WORD_STYLES = `
  @page Section1 { size: 21cm 29.7cm; margin: 2.7cm 2cm 2.2cm 2cm; mso-header-margin: 1cm; mso-footer-margin: 0.9cm; mso-header: h1; mso-first-header: fh1; mso-footer: f1; mso-first-footer: f1; mso-title-page: yes; }
  div.Section1 { page: Section1; }
  body { font-family: var(--font-family-body); color: var(--color-text-base-primary); font-size: 10pt; line-height: 1.4; }
  h1 { font-family: var(--font-family-heading); font-size: 28pt; margin: 14pt 0 2pt; }
  .subtitle { font-family: var(--font-family-heading); color: var(--color-brand-primary); font-size: 18pt; margin-bottom: 14pt; }
  .eyebrow { font-family: var(--font-family-body); color: var(--color-brand-primary); font-size: 8.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1pt; margin: 20pt 0 0; page-break-after: avoid; }
  .cover-eyebrow { margin: 0 0 6pt; }
  h2 { font-family: var(--font-family-heading); font-size: 15pt; margin: 18pt 0 8pt; page-break-after: avoid; }
  h2.section { margin-top: 0; padding-bottom: 4pt; border-bottom: 1.5pt solid var(--color-brand-primary); }
  h3 { font-family: var(--font-family-heading); font-size: 12pt; margin: 12pt 0 4pt; page-break-after: avoid; }
  p { margin: 0 0 8pt; text-align: justify; }
  a { color: var(--color-brand-primary); font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; }
  .grid th, .grid td, .guide th, .guide td { border: 1px solid var(--color-border-primary); padding: 4pt 7pt; vertical-align: top; text-align: left; font-size: 9.5pt; }
  .grid thead th { background: var(--color-brand-primary); color: var(--color-brand-primary-contrast); font-weight: bold; vertical-align: middle; }
  .grid thead th.sub { background: var(--color-surface-secondary); color: var(--color-text-base-primary); }
  .center td, .center th { text-align: center; }
  .issues td.overdue { color: var(--color-feedback-danger, var(--color-text-base-primary)); font-weight: bold; }
  .kv th { width: 32%; background: var(--color-surface-secondary); color: var(--color-text-base-muted); font-weight: bold; }
  .qa tbody th { width: 34%; background: var(--color-surface-secondary); font-weight: bold; }
  .qa td { text-align: justify; }
  .guide { width: auto; font-size: 9pt; } .guide td, .guide th { text-align: center; }
  .guide thead th { background: var(--color-surface-secondary); color: var(--color-text-base-primary); }
  .muted { color: var(--color-text-base-muted); }
  p.center { text-align: center; }
  .note { font-size: 9pt; color: var(--color-text-base-muted); }
  .cover td { border: 0; padding: 0; vertical-align: middle; }
  .phases td { background: var(--color-brand-primary); color: var(--color-brand-primary-contrast); font-weight: bold; font-size: 9pt; text-align: center; padding: 5pt; border: 3pt solid var(--color-surface-canvas); }
  p.MsoHeader, p.MsoFooter { margin: 0; font-family: var(--font-family-body); font-size: 7.5pt; color: var(--color-text-base-muted); tab-stops: center 8.5cm right 17cm; }
  p.MsoFooter { border-top: 0.5pt solid var(--color-border-primary); padding-top: 4pt; }
  p.MsoFooter a { color: var(--color-brand-primary); font-weight: bold; }
`;

// Light-theme token values, read from a hidden frame that loads only the design-system tokens
// (the app itself may be in dark mode).
async function tokenReader() {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/design-system/css/tokens.css"></head><body></body></html>';
  const loaded = new Promise((res) => { frame.onload = res; });
  document.body.appendChild(frame);
  await loaded;
  const link = frame.contentDocument.querySelector('link');
  if (link && !link.sheet) await new Promise((res) => { link.onload = link.onerror = res; });
  const style = frame.contentWindow.getComputedStyle(frame.contentDocument.documentElement);
  return { get: (name) => style.getPropertyValue(name).trim(), done: () => frame.remove() };
}

// Replaces var(--x, fallback) with values until none are left (innermost first, so fallbacks nest).
function resolveVars(css, get) {
  const re = /var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g;
  for (let i = 0; i < 10 && re.test(css); i += 1) {
    re.lastIndex = 0;
    css = css.replace(re, (_, name, fallback) => resolveVars(get(name), get) || (fallback ?? '').trim() || 'inherit');
  }
  return css;
}

// Loads an image (PNG or SVG) and returns it as PNG bytes (base64) at a fixed display height in points.
async function pngPart(src, name, heightPt) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const ratio = (img.naturalWidth || 300) / (img.naturalHeight || 100);
  const scale = 3; // sharp when printed
  const h = Math.round(heightPt * 1.333 * scale);
  const w = Math.round(h * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const data = canvas.toDataURL('image/png').split(',')[1];
  return { name, data, width: Math.round(heightPt * ratio), height: heightPt };
}

const b64Utf8 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const wrap76 = (b64) => b64.replace(/.{76}/g, '$&\r\n');

// Word running header and footer, as the PIA documents: no header on the cover (it has the logo), the emblem
// top left on later pages, and "offices · cloudstaff.com · Page N of M" on every page. Word lifts the
// mso-element divs into the header/footer (@page Section1 names them); the table holding them sits off the page.
function wordHeaderFooter(emblemImg) {
  const field = (code) => `<span style='mso-element:field-begin'></span><span style='mso-spacerun:yes'> </span>${code}<span style='mso-element:field-separator'></span>1<span style='mso-element:field-end'></span>`;
  return `<table style="margin-left:50in;width:1px"><tr><td>
<div style="mso-element:header" id="fh1"><p class="MsoHeader">&nbsp;</p></div>
<div style="mso-element:header" id="h1"><p class="MsoHeader">${emblemImg}</p></div>
<div style="mso-element:footer" id="f1"><p class="MsoFooter">${OFFICES.replace(/ /g, '&nbsp;')}<span style="mso-tab-count:1"></span><a href="https://www.cloudstaff.com">cloudstaff.com</a><span style="mso-tab-count:1"></span>Page ${field('PAGE')} of ${field('NUMPAGES')}</p></div>
</td></tr></table>`;
}

// bodyHtml: the report body as shown (and maybe edited) in the preview tab; default is a fresh render.
export async function downloadWordReport(r, fileName, { jiraBase = '', bodyHtml } = {}) {
  const tokens = await tokenReader();
  let css;
  try {
    css = resolveVars(WORD_STYLES, tokens.get);
  } finally {
    tokens.done();
  }
  const sealName = String(r.seal || '').toLowerCase();
  const [seal, logo, emblem] = await Promise.all([
    SEAL_IMAGES.has(sealName) ? pngPart(`/seals/${sealName}.png`, 'seal.png', 36).catch(() => null) : null,
    pngPart(LOGO, 'logo.png', 30).catch(() => null),
    pngPart(EMBLEM, 'emblem.png', 32).catch(() => null),
  ]);
  const imgTag = (part, alt) => (part ? `<img src="${part.name}" width="${Math.round(part.width * 1.333)}" height="${Math.round(part.height * 1.333)}" alt="${esc(alt)}">` : '');

  const body = (bodyHtml ?? reportBody(r, jiraBase))
    // Cover: the logo top right, as a borderless table.
    .replace(/<header class="cover">[\s\S]*?<\/header>/, `<table class="cover"><tr><td style="text-align:right">${imgTag(logo, 'Cloudstaff')}</td></tr></table>`)
    // The seal next to its name in the cover card.
    .replace(/<span class="seal-cell">([\s\S]*?)<\/span>/g, '$1')
    // Phase chips as one row of cells.
    .replace(/<div class="phases">([\s\S]*?)<\/div>/g, (_, spans) => `<table class="phases"><tr>${spans.replace(/<span>/g, '<td>').replace(/<\/span>/g, '</td>')}</tr></table>`)
    // Any other seal image (e.g. in the guide) uses the embedded PNG.
    .replace(/<img class="seal"[^>]*>/g, imgTag(seal, `${r.seal} security seal`));

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(fileName)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${css}</style></head>
<body><div class="Section1">
${body}
${wordHeaderFooter(imgTag(emblem, 'Cloudstaff'))}
</div></body></html>`;

  const boundary = `----=_NextPart_${Date.now().toString(36)}`;
  const base = 'file:///C:/report/';
  const parts = [
    `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: ${base}report.htm\r\n\r\n${wrap76(b64Utf8(html))}`,
    ...[seal, logo, emblem].filter(Boolean).map((p) => `--${boundary}\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-Location: ${base}${p.name}\r\n\r\n${wrap76(p.data)}`),
  ];
  const mhtml = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${boundary}"; type="text/html"\r\n\r\n${parts.join('\r\n\r\n')}\r\n\r\n--${boundary}--\r\n`;

  const url = URL.createObjectURL(new Blob([mhtml], { type: 'application/msword' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
