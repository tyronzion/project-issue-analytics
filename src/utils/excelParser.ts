import * as XLSX from 'xlsx';
import { IssueRecord, ColumnMapping, FormulaConfig, ProjectSummary } from '../types';
import { parseDateToISO } from './dateUtils';

export function detectPlatformTag(summary: string, config: FormulaConfig): 'IOS' | 'AOS' | 'GENERAL' | string {
  if (!summary) return 'GENERAL';
  const text = config.caseSensitiveKeywords ? summary : summary.toUpperCase();
  const iosKey = (config.iosKeyword ? (config.caseSensitiveKeywords ? config.iosKeyword : config.iosKeyword.toUpperCase()) : '[IOS]').trim();
  const aosKey = (config.aosKeyword ? (config.caseSensitiveKeywords ? config.aosKeyword : config.aosKeyword.toUpperCase()) : '[AOS]').trim();

  // 1. Direct configured keyword check
  if (iosKey && text.includes(iosKey)) return 'IOS';
  if (aosKey && text.includes(aosKey)) return 'AOS';

  // 2. Standard bracket, parenthesis & word variations (case-insensitive)
  // IOS variations: [IOS], [ios], (IOS), (ios), 【IOS】, \bIOS\b, \biOS\b, \bIPHONE\b
  if (/(\[\s*IOS\s*\]|\(\s*IOS\s*\)|【\s*IOS\s*】|\bIOS\b|\biOS\b|\bIPHONE\b)/i.test(summary)) {
    return 'IOS';
  }
  // AOS variations: [AOS], [aos], (AOS), (aos), 【AOS】, \bAOS\b, \bANDROID\b, \bAndroid\b, [Android]
  if (/(\[\s*AOS\s*\]|\(\s*AOS\s*\)|【\s*AOS\s*】|\bAOS\b|\bANDROID\b|\bAndroid\b|\[\s*Android\s*\]|\(\s*Android\s*\))/i.test(summary)) {
    return 'AOS';
  }

  // 3. Additional custom keywords
  for (const custom of config.additionalKeywords || []) {
    const key = config.caseSensitiveKeywords ? custom.tag : custom.tag.toUpperCase();
    if (text.includes(key)) {
      return custom.name;
    }
  }

  return 'GENERAL';
}

export function autoDetectColumns(headers: string[]): ColumnMapping {
  const findMatch = (candidates: string[]): string => {
    for (const cand of candidates) {
      const match = headers.find(h => {
        const clean = h.trim().toLowerCase().replace(/[_\-\s]+/g, '');
        const target = cand.toLowerCase().replace(/[_\-\s]+/g, '');
        return clean === target || clean.includes(target) || target.includes(clean);
      });
      if (match) return match;
    }
    return '';
  };

  return {
    projectColumn: findMatch(['Project', 'Project Name', 'Application', 'App', 'Component']) || headers[0] || 'Project',
    summaryColumn: findMatch(['Summary', 'Title', 'Issue Summary', 'Description', 'Subject']) || 'Summary',
    createdColumn: findMatch(['Created', 'Created Date', 'Date Created', 'Creation Date', 'Reported Date']) || 'Created',
    statusChangeColumn: findMatch(['Status Category change', 'Status Category Change', 'Resolved', 'Resolved Date', 'Resolution Date', 'Updated', 'Status Change Date']) || 'Status Category change',
    statusColumn: findMatch(['Status', 'Issue Status', 'State', 'Status Category']) || 'Status',
    keyColumn: findMatch(['Issue key', 'Key', 'Issue Key', 'ID', 'Ticket ID', 'Issue ID']) || 'Issue key',
    issueTypeColumn: findMatch(['Issue Type', 'Type', 'Tracker']) || '',
    priorityColumn: findMatch(['Priority', 'Severity']) || '',
    severityColumn: findMatch(['Severity', 'Security Severity', 'Risk Severity']) || '',
    assigneeColumn: findMatch(['Assignee', 'Owner', 'Developer']) || '',
    securityDueDateColumn: findMatch(['Security Due Date', 'SecurityDueDate', 'Sec Due Date', 'Security Due', 'Security Target Date', 'Due Date', 'Sec Due', 'Target Due Date']) || '',
  };
}

export async function parseExcelOrCsvFile(
  file: File,
  currentConfig: FormulaConfig
): Promise<{ rows: IssueRecord[]; detectedHeaders: string[]; autoMapping: ColumnMapping }> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON with raw objects
  const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: '',
    raw: false, // Ensures dates formatted as strings if possible
  });

  return mapObjectsToIssueRecords(rawJson, currentConfig);
}

export function mapObjectsToIssueRecords(
  rawJson: Record<string, any>[],
  currentConfig: FormulaConfig
): { rows: IssueRecord[]; detectedHeaders: string[]; autoMapping: ColumnMapping } {
  const headerSet = new Set<string>();
  rawJson.forEach(row => {
    Object.keys(row).forEach(k => headerSet.add(k));
  });
  const headers = Array.from(headerSet);
  const autoMapping = autoDetectColumns(headers);

  const pCol = currentConfig.columnMapping.projectColumn || autoMapping.projectColumn;
  const sCol = currentConfig.columnMapping.summaryColumn || autoMapping.summaryColumn;
  const cCol = currentConfig.columnMapping.createdColumn || autoMapping.createdColumn;
  const scCol = currentConfig.columnMapping.statusChangeColumn || autoMapping.statusChangeColumn;
  const stCol = currentConfig.columnMapping.statusColumn || autoMapping.statusColumn;
  const kCol = currentConfig.columnMapping.keyColumn || autoMapping.keyColumn;
  const itCol = currentConfig.columnMapping.issueTypeColumn || autoMapping.issueTypeColumn;
  const prCol = currentConfig.columnMapping.priorityColumn || autoMapping.priorityColumn;
  const sevCol = currentConfig.columnMapping.severityColumn || autoMapping.severityColumn;
  const asCol = currentConfig.columnMapping.assigneeColumn || autoMapping.assigneeColumn;
  const sddCol = currentConfig.columnMapping.securityDueDateColumn || autoMapping.securityDueDateColumn;

  const rows: IssueRecord[] = rawJson.map((row, index) => {
    const getPreferred = (preferred: string, fallback: string): any => {
      if (preferred && row[preferred] !== undefined && row[preferred] !== null && String(row[preferred]).trim() !== '') {
        return row[preferred];
      }
      if (fallback && row[fallback] !== undefined && row[fallback] !== null && String(row[fallback]).trim() !== '') {
        return row[fallback];
      }
      return '';
    };

    const rawKey = String(getPreferred(kCol, autoMapping.keyColumn) || `ROW-${index + 1}`).trim();
    const rawProject = String(getPreferred(pCol, autoMapping.projectColumn) || 'Unknown Application').trim();
    const rawSummary = String(getPreferred(sCol, autoMapping.summaryColumn) || '').trim();
    const rawCreated = getPreferred(cCol, autoMapping.createdColumn);
    const rawStatusChange = getPreferred(scCol, autoMapping.statusChangeColumn);
    const rawStatus = String(getPreferred(stCol, autoMapping.statusColumn) || 'Open').trim();
    const rawPriority = String(getPreferred(prCol, autoMapping.priorityColumn) || '').trim();
    const rawSeverity = String(getPreferred(sevCol, autoMapping.severityColumn) || rawPriority).trim();
    const rawSecurityDueDate = getPreferred(sddCol, autoMapping.securityDueDateColumn) || row['Security Due Date'] || row['Security due date'] || row['SecurityDueDate'] || '';
    const rawIssueType = String(getPreferred(itCol, autoMapping.issueTypeColumn) || '').trim();
    const rawAssignee = String(getPreferred(asCol, autoMapping.assigneeColumn) || '').trim();

    const createdIso = parseDateToISO(rawCreated);
    const statusChangeIso = parseDateToISO(rawStatusChange);
    const securityDueDateIso = parseDateToISO(rawSecurityDueDate);
    const tag = detectPlatformTag(rawSummary, currentConfig);

    return {
      id: rawKey || `ROW-${index + 1}`,
      project: rawProject || 'Unknown Application',
      baseProject: rawProject || 'Unknown Application',
      summary: rawSummary,
      created: createdIso,
      createdRaw: String(rawCreated),
      statusCategoryChange: statusChangeIso,
      statusCategoryChangeRaw: String(rawStatusChange),
      status: rawStatus,
      issueType: rawIssueType,
      priority: rawPriority,
      severity: rawSeverity,
      assignee: rawAssignee,
      platformTag: tag,
      securityDueDate: securityDueDateIso,
      securityDueDateRaw: String(rawSecurityDueDate || ''),
      raw: row,
    };
  });

  return { rows, detectedHeaders: headers, autoMapping };
}

export function mergeIssueDatasets(
  existing: IssueRecord[],
  incoming: IssueRecord[],
  strategy: 'deduplicate' | 'append' | 'replace'
): { merged: IssueRecord[]; addedCount: number; updatedCount: number } {
  if (strategy === 'replace') {
    return {
      merged: incoming,
      addedCount: incoming.length,
      updatedCount: 0,
    };
  }

  if (strategy === 'append') {
    return {
      merged: [...existing, ...incoming],
      addedCount: incoming.length,
      updatedCount: 0,
    };
  }

  // Deduplicate by ID
  const map = new Map<string, IssueRecord>();
  existing.forEach(item => map.set(item.id, item));

  let updatedCount = 0;
  let addedCount = 0;

  incoming.forEach(item => {
    if (map.has(item.id)) {
      map.set(item.id, item);
      updatedCount++;
    } else {
      map.set(item.id, item);
      addedCount++;
    }
  });

  return {
    merged: Array.from(map.values()),
    addedCount,
    updatedCount,
  };
}

export function exportToExcel(
  summaries: ProjectSummary[],
  filteredIssues: IssueRecord[],
  dateRangeText: string,
  fileName: string = 'Project_Issues_Metrics_Report.xlsx',
  includeSeverity: boolean = true
): void {
  const workbook = XLSX.utils.book_new();

  // 1. Summaries Sheet
  const summaryData = summaries.map(s => {
    const base = {
      'Project (Application)': s.projectName,
      'Platform Type': s.platformTag === 'IOS' ? 'iOS' : s.platformTag === 'AOS' ? 'Android' : 'Web / General',
      'Found Issues (Created in Range)': s.totalFound,
      'Resolved Issues (Done in Range)': s.resolved,
      'Outstanding / Backlog': s.outstanding,
      'Risk Accepted': s.riskAccepted || 0,
      'Security Overdue (Overdue Issues)': s.securityOverdue || 0,
      'Resolution Rate (%)': `${s.resolutionRate.toFixed(1)}%`,
      'Total All-Time Records': s.totalAllTime,
    } as Record<string, string | number>;

    if (!includeSeverity) {
      return base;
    }

    return {
      ...base,
      'Found Low': s.foundBySeverity.low,
      'Found Medium': s.foundBySeverity.medium,
      'Found High': s.foundBySeverity.high,
      'Found Critical': s.foundBySeverity.critical,
      'Resolved Low': s.resolvedBySeverity.low,
      'Resolved Medium': s.resolvedBySeverity.medium,
      'Resolved High': s.resolvedBySeverity.high,
      'Resolved Critical': s.resolvedBySeverity.critical,
      'Outstanding Low': s.outstandingBySeverity.low,
      'Outstanding Medium': s.outstandingBySeverity.medium,
      'Outstanding High': s.outstandingBySeverity.high,
      'Outstanding Critical': s.outstandingBySeverity.critical,
    };
  });

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Project Metrics');

  // 2. Filtered Issues Sheet
  const issuesData = filteredIssues.map(i => ({
    'Issue Key': i.id,
    'Project': i.project,
    'Summary': i.summary,
    'Platform Tag': i.platformTag,
    'Status': i.status,
    'Created Date': i.created || i.createdRaw || '',
    'Status Category Change Date': i.statusCategoryChange || i.statusCategoryChangeRaw || '',
    'Security Due Date': i.securityDueDate || i.securityDueDateRaw || '',
    'Issue Type': i.issueType || '',
    'Priority': i.priority || '',
    'Assignee': i.assignee || '',
  }));

  const issuesSheet = XLSX.utils.json_to_sheet(issuesData);
  XLSX.utils.book_append_sheet(workbook, issuesSheet, 'Filtered Issues');

  // Download
  XLSX.writeFile(workbook, fileName);
}
