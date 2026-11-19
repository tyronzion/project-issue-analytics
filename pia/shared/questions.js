// The Cloudstaff "Privacy Impact Assessment" template questions (sections I–VI), with which repository evidence
// can show a change to the answer (pia/server/repoScan.js diff). evidence: [] means the repository can't answer it;
// the reassessment asks a person to confirm it is still true.
//   fields         personal-data fields added or removed      identifiers   government / employee IDs added
//   integrations   outside services added or removed          storage       new database or database name
//   analytics      AI, analytics or search services added or removed
//   auth, roles, audit, consent, retention, export, anonymisation, encryption   privacy controls added or removed

export const SECTIONS = [
  { id: 'I', title: 'SECTION I - Data in the System' },
  { id: 'II', title: 'SECTION II - Attributes of the Data (use and accuracy)' },
  { id: 'III', title: 'SECTION III - Sharing Practices' },
  { id: 'IV', title: 'SECTION IV - Notice to Individuals to Decline/Consent Use' },
  { id: 'V', title: 'SECTION V - Access to Data (administrative and technological controls)' },
  { id: 'VI', title: 'SECTION VI - Privacy Analysis' },
];

const q = (id, section, text, evidence = [], group = null) => ({ id, section, text, evidence, group });

export const QUESTIONS = [
  q('I.1', 'I', 'What data is to be collected?', ['fields', 'identifiers']),
  q('I.2', 'I', 'What are the sources of data?', ['integrations', 'auth']),
  q('I.3', 'I', 'Why is the data being collected?'),
  q('I.4', 'I', 'What technologies will be used to collect data?', ['storage', 'integrations']),
  q('II.1', 'II', 'Describe the uses of the data.', ['fields']),
  q('II.2', 'II', 'Does the system analyze data to assist users in identifying previously unknown areas of note, concern, or pattern?', ['analytics']),
  q('II.3', 'II', 'How will the data collected from individuals or derived by the system be checked for accuracy?'),
  q('III.1', 'III', 'Will the data be shared with any internal or external organizations?', ['integrations']),
  q('III.2', 'III', 'How is the data transmitted or disclosed to the internal or external organization?', ['integrations']),
  q('IV.1', 'IV', 'Was notice provided to the different individuals prior to the collection of data?', ['consent']),
  q('IV.2', 'IV', 'Do individuals have the opportunity and/or right to decline to provide data?', ['consent']),
  q('V.1', 'V', 'What are the procedures for identification and disposition of the data at the end of the retention period?', ['retention']),
  q('V.2', 'V', 'Describe the privacy training provided to users, either generally or specifically relevant to the program or system?'),
  q('V.3', 'V', 'Which user group(s) will have access to the system?', ['roles', 'auth']),
  q('V.4', 'V', 'How is access to the data by a user determined? Are procedures documented?', ['roles', 'auth']),
  q('V.5', 'V', 'What auditing measures/controls and technical safeguards are in place to prevent misuse (e.g., unauthorized browsing) of data?', ['audit', 'encryption', 'roles']),
  q('VI.1', 'VI', 'Are data subjects aware of the nature, purpose, and extent of the processing of his or her personal data?', ['consent'], 'Transparency'),
  q('VI.2', 'VI', 'Are data subjects aware of the risks and safeguards involved in the processing of his or her personal data?', [], 'Transparency'),
  q('VI.3', 'VI', 'Are data subjects aware of his or her rights as a data subject and how these can be exercised?', ['consent'], 'Transparency'),
  q('VI.4', 'VI', 'Is there a document available for public review that sets out the policies for the management of personal data?', ['consent'], 'Transparency'),
  q('VI.5', 'VI', 'Are there steps in place to allow an individual to know what personal data it holds about them and its purpose of collection, usage and disclosure?', ['export'], 'Transparency'),
  q('VI.6', 'VI', 'Are the data subjects aware of the identity of the personal information controller or the organization/entity processing their personal data?', [], 'Transparency'),
  q('VI.7', 'VI', 'Is the processing of personal data adequate, relevant, suitable, necessary and not excessive in relation to a declared and specified purpose?', ['fields'], 'Proportionality'),
  q('VI.8', 'VI', 'Is the processing of personal data necessary to fulfill the purpose of the processing and no other means are available?', [], 'Proportionality'),
  q('VI.9', 'VI', 'Is the collection of personal data for a declared, specified, and legitimate purpose?', [], 'Collection'),
  q('VI.10', 'VI', 'Is individual consent secured prior to the collection and processing of personal data? If no, specify the reason', ['consent'], 'Collection'),
  q('VI.11', 'VI', 'Is consent time-bound in relation to the declared, specified and legitimate purpose?', ['consent'], 'Collection'),
  q('VI.12', 'VI', 'Can consent be withdrawn?', ['consent'], 'Collection'),
  q('VI.13', 'VI', 'Are all the personal data collected necessary for the program?', ['fields'], 'Collection'),
  q('VI.14', 'VI', 'Are personal data anonymized or de-identified?', ['anonymisation'], 'Collection'),
  q('VI.15', 'VI', 'Is the collection of personal data directly from the individual?', ['integrations'], 'Collection'),
  q('VI.16', 'VI', 'Is there authority for collecting personal data about the individual from other sources?', ['integrations'], 'Collection'),
  q('VI.17', 'VI', 'Is it necessary to assign or collect a unique identifier to individuals to enable your organization to carry out the program?', ['identifiers'], 'Collection'),
  q('VI.18', 'VI', 'Is it necessary to collect a unique identifier of another agency?', ['identifiers'], 'Collection'),
  q('VI.19', 'VI', 'Will Personal data only be used or disclosed for the primary purpose?', ['integrations'], 'Use and Disclosure'),
  q('VI.20', 'VI', 'Are the uses and disclosures of personal data for a secondary purpose authorized by law or the individual?', [], 'Use and Disclosure'),
  q('VI.21', 'VI', 'Is the system regularly tested for accuracy?', [], 'Use and Disclosure'),
  q('VI.22', 'VI', 'Periodic reviews of the information.', [], 'Use and Disclosure'),
  q('VI.23', 'VI', 'Are staff trained in the use of the tools and receive periodic updates?', [], 'Use and Disclosure'),
  q('VI.24', 'VI', 'Reviews of audit trails are undertaken regularly?', ['audit'], 'Use and Disclosure'),
  q('VI.25', 'VI', 'Incidents are reviewed for lessons learnt and systems/ processes updated appropriately', [], 'Use and Disclosure'),
];

// Which evidence kinds changed, from a repoScan diff (or several, one per repo).
export function changedEvidence(diffs) {
  const kinds = {};
  const add = (k, line) => (kinds[k] ||= []).push(line);
  for (const { repo, diff } of diffs) {
    if (!diff) continue;
    for (const f of diff.fieldsAdded) add('fields', `${repo}: new field "${f.identifier}" (${f.category}) in ${f.path}:${f.line}`);
    for (const f of diff.fieldsRemoved) add('fields', `${repo}: field "${f.identifier}" (${f.category}) removed`);
    for (const f of diff.fieldsAdded.filter((x) => /Government ID|Employee/.test(x.category))) add('identifiers', `${repo}: new identifier "${f.identifier}" (${f.category})`);
    for (const i of diff.integrationsAdded) add('integrations', `${repo}: new outside service ${i.label} (${i.kind})`);
    for (const i of diff.integrationsRemoved) add('integrations', `${repo}: outside service ${i.label} removed`);
    for (const i of [...diff.integrationsAdded, ...diff.integrationsRemoved].filter((x) => /^(AI|Analytics|Search)$/.test(x.kind))) add('analytics', `${repo}: ${i.label} (${i.kind}) ${diff.integrationsAdded.includes(i) ? 'added' : 'removed'}`);
    for (const d of diff.databasesAdded) add('storage', `${repo}: database "${d}" configured`);
    if (diff.newStorage) add('storage', `${repo}: a database was added`);
    for (const [k, c] of Object.entries(diff.controls || {})) {
      for (const x of c.added) add(k, `${repo}: added ${x}`);
      for (const x of c.removed) add(k, `${repo}: removed ${x}`);
    }
  }
  return kinds;
}

// Per question: 'changed' (with evidence lines), 'unchanged' (evidence checked, nothing changed) or 'manual'.
export function questionStatus(kinds) {
  return QUESTIONS.map((qq) => {
    if (!qq.evidence.length) return { ...qq, status: 'manual', evidenceLines: [] };
    const lines = [...new Set(qq.evidence.flatMap((k) => kinds[k] || []))];
    return { ...qq, status: lines.length ? 'changed' : 'unchanged', evidenceLines: lines.slice(0, 20) };
  });
}
