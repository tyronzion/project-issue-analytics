import { IssueRecord, FormulaConfig, DateFilter, ProjectSummary, ProjectAlias, SeverityBreakdown, SeverityLevel } from '../types';
import { isDateInRange, parseDateToISO } from './dateUtils';
import { detectPlatformTag } from './excelParser';
import { 
  parseTargetProjectItem, 
  matchIssueToTargetList, 
  extractBaseProjectName, 
  extractSubprojectFromSummary,
  ParsedTargetProject 
} from './projectMatcher';

export function normalizeProjectName(rawName: string, aliases: ProjectAlias[]): string {
  if (!rawName) return 'Unknown Application';
  const trimmed = rawName.trim();
  const safeAliases = aliases || [];
  const foundAlias = safeAliases.find(a => (a.from || '').trim().toLowerCase() === trimmed.toLowerCase());
  return foundAlias ? foundAlias.to.trim() : trimmed;
}

function createEmptySeverityBreakdown(): SeverityBreakdown {
  return {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
}

function getNormalizedSeverity(issue: IssueRecord): SeverityLevel | undefined {
  const rawSeverity = String(
    issue.severity ||
    issue.raw?.severity ||
    issue.raw?.Severity ||
    issue.raw?.SEVERITY ||
    issue.priority ||
    ''
  )
    .trim()
    .toLowerCase();

  if (!rawSeverity) return undefined;

  if (['critical', 'sev1', 's1', 'p0', 'blocker', 'urgent'].includes(rawSeverity)) {
    return 'critical';
  }
  if (['high', 'sev2', 's2', 'p1', 'major'].includes(rawSeverity)) {
    return 'high';
  }
  if (['medium', 'med', 'moderate', 'sev3', 's3', 'p2', 'normal'].includes(rawSeverity)) {
    return 'medium';
  }
  if (['low', 'minor', 'trivial', 'sev4', 's4', 'p3', 'p4'].includes(rawSeverity)) {
    return 'low';
  }

  return undefined;
}

function incrementSeverityCount(target: SeverityBreakdown, issue: IssueRecord): void {
  const level = getNormalizedSeverity(issue);
  if (!level) return;
  target[level] += 1;
}

export function isIssueFoundInRange(issue: IssueRecord, dateFilter: DateFilter): boolean {
  if (!issue.created) return false;
  return isDateInRange(issue.created, dateFilter.startDate, dateFilter.endDate);
}

export function isIssueResolved(issue: IssueRecord, config: FormulaConfig, dateFilter: DateFilter): boolean {
  // Check if status matches Done statuses (case-insensitive)
  const currentStatus = (issue.status || '').trim().toLowerCase();
  const isDoneStatus = config.doneStatuses.some(s => s.trim().toLowerCase() === currentStatus);
  if (!isDoneStatus) return false;

  // Check if statusCategoryChange date is in range
  if (!issue.statusCategoryChange) {
    if (!dateFilter.startDate && !dateFilter.endDate) {
      return true;
    }
    return false;
  }

  return isDateInRange(issue.statusCategoryChange, dateFilter.startDate, dateFilter.endDate);
}

export function isIssueOutstanding(issue: IssueRecord, config: FormulaConfig): boolean {
  const currentStatus = (issue.status || '').trim().toLowerCase();
  
  const isDone = config.doneStatuses.some(s => s.trim().toLowerCase() === currentStatus);
  if (isDone) return false;

  const isCancelled = config.cancelledStatuses.some(s => s.trim().toLowerCase() === currentStatus);
  if (isCancelled) return false;

  if (isIssueRiskAccepted(issue, config)) return false;

  return true;
}

export function isIssueRiskAccepted(issue: IssueRecord, config: FormulaConfig): boolean {
  const currentStatus = (issue.status || '').trim().toLowerCase();
  return (config.riskAcceptedStatuses || ['Risk Accepted'])
    .some(status => status.trim().toLowerCase() === currentStatus);
}

export function isIssueSecurityOverdue(
  issue: IssueRecord,
  config: FormulaConfig,
  dateFilter: DateFilter
): boolean {
  // Check if issue has a Security Due Date
  const rawDue = issue.securityDueDate || issue.securityDueDateRaw;
  if (!rawDue) return false;

  const dueIso = issue.securityDueDate && issue.securityDueDate.length === 10
    ? issue.securityDueDate
    : parseDateToISO(rawDue);
  if (!dueIso) return false;

  // Status check: must not be Done or Cancelled
  const currentStatus = (issue.status || '').trim().toLowerCase();
  const isDone = config.doneStatuses.some(s => s.trim().toLowerCase() === currentStatus);
  if (isDone) return false;

  const isCancelled = config.cancelledStatuses.some(s => s.trim().toLowerCase() === currentStatus);
  if (isCancelled) return false;

  if (isIssueRiskAccepted(issue, config)) return false;

  // Formula: issue is overdue when Security Due Date is earlier than today's date.
  // Example: today = '2026-08-18', dueDate = '2026-08-17' => overdue.
  const todayIso = new Date().toISOString().split('T')[0];
  if (!todayIso) return false;

  return dueIso < todayIso;
}

export function generateDynamicProjectName(
  baseProject: string,
  platformTag: string | undefined,
  config: FormulaConfig
): string {
  if (!config.splitProjectsByPlatform) {
    return baseProject;
  }

  if (platformTag === 'IOS') {
    const pattern = config.platformNamingPattern || '{project} {platform}';
    return pattern.replace('{project}', baseProject).replace('{platform}', 'IOS').trim();
  }

  if (platformTag === 'AOS') {
    const pattern = config.platformNamingPattern || '{project} {platform}';
    return pattern.replace('{project}', baseProject).replace('{platform}', 'AOS').trim();
  }

  if (platformTag && platformTag !== 'GENERAL') {
    const pattern = config.platformNamingPattern || '{project} {platform}';
    return pattern.replace('{project}', baseProject).replace('{platform}', platformTag).trim();
  }

  // Web / General application (no [IOS] and no [AOS] in summary)
  return baseProject;
}

export function computeProjectSummaries(
  allIssues: IssueRecord[],
  config: FormulaConfig,
  dateFilter: DateFilter,
  deletedProjects: string[] = [],
  aliases: ProjectAlias[] = [],
  customProjectList: string[] = [],
  useCustomProjectListOnly: boolean = false
): { summaries: ProjectSummary[]; filteredIssues: IssueRecord[] } {
  // Map of tracked projects
  const projectMap = new Map<string, { baseProject: string; platformTag: string; isFromCustomList: boolean; matchReason?: string; issues: IssueRecord[] }>();

  // Parse custom target projects if provided
  const validCustomList = (customProjectList || []).map(p => p.trim()).filter(p => p.length > 0);
  const parsedTargets: ParsedTargetProject[] = validCustomList.map(item => parseTargetProjectItem(item, config));
  const hasTargetList = parsedTargets.length > 0;

  const processedIssues: IssueRecord[] = [];

  if (hasTargetList) {
    // 1. Pre-seed projectMap with ALL target projects from the watchlist
    // Guarantees 0-count display for projects that have 0 issues
    parsedTargets.forEach(t => {
      projectMap.set(t.cleanName, {
        baseProject: t.baseProject,
        platformTag: t.requiredPlatformTag || 'GENERAL',
        isFromCustomList: true,
        matchReason: `Target List: ${t.cleanName}`,
        issues: [],
      });
    });

    // 2. Evaluate all issues against the target list
    // - If an issue matches a target in the list -> add it to that target project
    // - If an issue does NOT match any target (e.g. [github] or untracked project) -> DISREGARD THE ISSUE COMPLETELY
    allIssues.forEach(issue => {
      const match = matchIssueToTargetList(issue, parsedTargets, config, aliases);
      if (match) {
        const mappedIssue: IssueRecord = {
          ...issue,
          baseProject: match.matchedTarget?.baseProject || issue.baseProject || match.matchedProjectName,
          project: match.matchedProjectName,
          platformTag: match.platformTag || issue.platformTag,
        };
        processedIssues.push(mappedIssue);

        if (projectMap.has(match.matchedProjectName)) {
          projectMap.get(match.matchedProjectName)!.issues.push(mappedIssue);
        }
      }
      // If no match: disregard issue, do not create new project, do not count
    });

  } else {
    // No target list provided: Auto-discover projects dynamically from dataset
    allIssues.forEach(issue => {
      const rawProj = issue.baseProject || issue.project || 'Unknown Application';
      const { base: cleanBaseProj, inferredPlatform } = extractBaseProjectName(rawProj);
      const normalizedBaseProj = normalizeProjectName(cleanBaseProj, aliases);

      let tag = detectPlatformTag(issue.summary, config);
      if (tag === 'GENERAL' && inferredPlatform && inferredPlatform !== 'GENERAL') {
        tag = inferredPlatform;
      }

      const effectiveBase = extractSubprojectFromSummary(issue.summary, normalizedBaseProj);
      const dynamicProjectName = generateDynamicProjectName(effectiveBase, tag, config);
      const finalProjectName = normalizeProjectName(dynamicProjectName, aliases);

      const mappedIssue: IssueRecord = {
        ...issue,
        baseProject: effectiveBase,
        project: finalProjectName,
        platformTag: tag
      };

      processedIssues.push(mappedIssue);

      if (!projectMap.has(finalProjectName)) {
        projectMap.set(finalProjectName, {
          baseProject: effectiveBase,
          platformTag: tag || 'GENERAL',
          isFromCustomList: false,
          issues: [],
        });
      }
      projectMap.get(finalProjectName)!.issues.push(mappedIssue);
    });
  }

  // Filter out deleted projects (projects in the target list are never blacklisted/deleted)
  const targetProjectNamesSet = new Set(parsedTargets.map(t => t.cleanName.toLowerCase()));
  const effectiveDeletedSet = new Set(
    (deletedProjects || [])
      .map(p => p.toLowerCase())
      .filter(p => !targetProjectNamesSet.has(p))
  );

  const activeIssues = processedIssues.filter(issue => {
    const isDynDeleted = effectiveDeletedSet.has(issue.project.toLowerCase());
    return !isDynDeleted;
  });

  const summaries: ProjectSummary[] = [];
  const allFilteredIssuesSet = new Set<string>();

  projectMap.forEach(({ baseProject, platformTag, isFromCustomList, issues }, projectName) => {
    // If project was deleted and is NOT in target list, skip
    if (effectiveDeletedSet.has(projectName.toLowerCase())) return;

    let generalFound = 0;
    let iosFound = 0;
    let aosFound = 0;
    let resolved = 0;
    let outstanding = 0;
    let riskAccepted = 0;
    let securityOverdue = 0;
    const foundBySeverity = createEmptySeverityBreakdown();
    const resolvedBySeverity = createEmptySeverityBreakdown();
    const outstandingBySeverity = createEmptySeverityBreakdown();

    issues.forEach(issue => {
      // Check Found in date range
      const isFound = isIssueFoundInRange(issue, dateFilter);
      if (isFound) {
        allFilteredIssuesSet.add(issue.id);
        incrementSeverityCount(foundBySeverity, issue);
        if (issue.platformTag === 'IOS') {
          iosFound++;
        } else if (issue.platformTag === 'AOS') {
          aosFound++;
        } else {
          generalFound++;
        }
      }

      // Check Resolved in date range
      if (isIssueResolved(issue, config, dateFilter)) {
        resolved++;
        incrementSeverityCount(resolvedBySeverity, issue);
        allFilteredIssuesSet.add(issue.id);
      }

      // Check Outstanding (backlog)
      if (isIssueOutstanding(issue, config)) {
        outstanding++;
        incrementSeverityCount(outstandingBySeverity, issue);
      }

      if (isIssueRiskAccepted(issue, config)) {
        riskAccepted++;
      }

      // Check Security Overdue (Security Due Date < End Date & Status is not Done/Cancelled)
      if (isIssueSecurityOverdue(issue, config, dateFilter)) {
        securityOverdue++;
      }
    });

    const totalFound = generalFound + iosFound + aosFound;
    const resolutionRate = totalFound > 0 ? (resolved / totalFound) * 100 : 0;

    summaries.push({
      projectName,
      baseProject,
      platformTag,
      generalFound,
      iosFound,
      aosFound,
      totalFound,
      resolved,
      outstanding,
      riskAccepted,
      securityOverdue,
      resolutionRate,
      totalAllTime: issues.length,
      foundBySeverity,
      resolvedBySeverity,
      outstandingBySeverity,
      isDeleted: false,
      isFromCustomList,
    });
  });

  // Sort summaries: If custom list exists, preserve custom list order or alphabetical
  if (hasTargetList) {
    const orderMap = new Map<string, number>();
    validCustomList.forEach((name, idx) => orderMap.set(name.toLowerCase(), idx));
    summaries.sort((a, b) => {
      const orderA = orderMap.has(a.projectName.toLowerCase()) ? orderMap.get(a.projectName.toLowerCase())! : 999;
      const orderB = orderMap.has(b.projectName.toLowerCase()) ? orderMap.get(b.projectName.toLowerCase())! : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.projectName.localeCompare(b.projectName);
    });
  } else {
    summaries.sort((a, b) => a.projectName.localeCompare(b.projectName));
  }

  // Determine filtered issues collection for drilldown
  const filteredIssues = activeIssues.filter(issue => {
    if (!dateFilter.startDate && !dateFilter.endDate) {
      return true;
    }
    return isIssueFoundInRange(issue, dateFilter) || isIssueResolved(issue, config, dateFilter);
  });

  return { summaries, filteredIssues };
}
