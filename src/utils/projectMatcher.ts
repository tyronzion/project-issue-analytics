import { IssueRecord, FormulaConfig, ProjectAlias } from '../types';
import { detectPlatformTag } from './excelParser';
import { normalizeProjectName } from './metricsEngine';

export interface ParsedTargetProject {
  originalInput: string;
  cleanName: string;
  baseProject: string;
  requiredPlatformTag: 'IOS' | 'AOS' | 'GENERAL' | string;
  isPlatformSpecific: boolean;
}

/**
 * Extracts bracketed tokens like [Tag] or 【Tag】 from any text.
 * Parentheses are intentionally ignored to prevent false project matches.
 */
export function extractBracketTags(text: string): string[] {
  if (!text) return [];
  const tags: string[] = [];
  const bracketRegex = /\[\s*([^\]]+?)\s*\]|【\s*([^】]+?)\s*】/g;
  let match;
  while ((match = bracketRegex.exec(text)) !== null) {
    const tag = (match[1] || match[2] || '').trim();
    if (tag) tags.push(tag);
  }
  return tags;
}

const GENERIC_WRAPPER_TAGS = new Set([
  'infosec',
  'security',
  'audit',
  'jira',
  'task',
  'bug',
  'story',
  'epic',
  'defect',
  'incident',
  'vulnerability',
  'github-codereview',
  'codereview',
  'code-review',
  'review',
  'qa',
  'test',
  'hotfix',
  'release',
  'general',
  'unknown'
]);

const PLATFORM_TAGS = new Set([
  'ios',
  'aos',
  'android',
  'web',
  'app',
  'application',
  'mobile'
]);

// These are permanent product-name equivalences used while matching summary tags.
// The canonical target remains "nextgeneration employee operation" in the UI.
const PERMANENT_PROJECT_MATCH_ALIASES: Record<string, string> = {
  aineo: 'nextgenerationemployeeoperation',
};

function canonicalizeProjectToken(value: string): string {
  const condensed = value.toLowerCase().trim().replace(/[\s\-_]+/g, '');
  return PERMANENT_PROJECT_MATCH_ALIASES[condensed] || condensed;
}

function isEquivalentProjectToken(left: string, right: string): boolean {
  return canonicalizeProjectToken(left) === canonicalizeProjectToken(right);
}

function stripAIPrefix(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/^ai[\s\-_:.]+/i, '').trim();
}

/**
 * Intelligently extracts subproject name from bracket tags in summary.
 * e.g. "[Infosec][AOS][Staffcentral][Github-Codereview]" -> "Staffcentral"
 * e.g. "[InfoSec] [AOS] [Doorspace]" -> "Doorspace"
 * e.g. "[InfoSec][AOS][Radio]" -> "Radio"
 * e.g. "[InfoSec][AOS][Tap]" -> "Tap"
 * e.g. "[InfoSec] [AOS] [Boardroom]" -> "Boardroom"
 */
export function extractSubprojectFromSummary(summary: string, defaultProject: string): string {
  if (!summary) return defaultProject;
  const tags = extractBracketTags(summary);
  if (tags.length === 0) return defaultProject;

  // Look for a tag that is not a platform tag and not a generic wrapper tag
  const subprojectTag = tags.find(tag => {
    const lower = tag.toLowerCase().trim();
    return !PLATFORM_TAGS.has(lower) && !GENERIC_WRAPPER_TAGS.has(lower);
  });

  if (subprojectTag) {
    return subprojectTag.trim();
  }

  return defaultProject;
}

/**
 * Extracts base project name and platform indicator if present.
 * e.g. "Genesis IOS" -> { base: "Genesis", inferredPlatform: "IOS" }
 * e.g. "Staffcentral IOS Project" -> { base: "Staffcentral", inferredPlatform: "IOS" }
 * e.g. "Genesis [AOS]" -> { base: "Genesis", inferredPlatform: "AOS" }
 * e.g. "Genesis Web" -> { base: "Genesis", inferredPlatform: "GENERAL" }
 * e.g. "Genesis" -> { base: "Genesis", inferredPlatform: "GENERAL" }
 */
export function extractBaseProjectName(rawName: string): { base: string; inferredPlatform?: 'IOS' | 'AOS' | 'GENERAL' | string } {
  if (!rawName) return { base: 'Unknown Application', inferredPlatform: 'GENERAL' };
  const trimmed = rawName.trim();

  // Strip brackets if entire string is bracketed e.g. "[Staffcentral]"
  const unbracketed = trimmed.replace(/^\[\s*|\s*\]$/g, '').replace(/^\(\s*|\s*\)$/g, '');

  const iosRegex = /[\s\-_]*(\[?\s*IOS\s*\]?|\(\s*IOS\s*\)|【\s*IOS\s*】|\biOS\b)[\s\-_]*(PROJECT|APP|APPLICATION)?$/i;
  const aosRegex = /[\s\-_]*(\[?\s*AOS\s*\]?|\(\s*AOS\s*\)|【\s*AOS\s*】|\bANDROID\b)[\s\-_]*(PROJECT|APP|APPLICATION)?$/i;
  const webRegex = /[\s\-_]*(\[?\s*WEB\s*\]?|\(\s*WEB\s*\)|\[?\s*APPLICATION\s*\]?|\(\s*APPLICATION\s*\))[\s\-_]*(PROJECT|APP)?$/i;

  if (iosRegex.test(unbracketed)) {
    const base = unbracketed.replace(iosRegex, '').trim();
    return { base: base || unbracketed, inferredPlatform: 'IOS' };
  }

  if (aosRegex.test(unbracketed)) {
    const base = unbracketed.replace(aosRegex, '').trim();
    return { base: base || unbracketed, inferredPlatform: 'AOS' };
  }

  if (webRegex.test(unbracketed)) {
    const base = unbracketed.replace(webRegex, '').trim();
    return { base: base || unbracketed, inferredPlatform: 'GENERAL' };
  }

  return { base: unbracketed, inferredPlatform: 'GENERAL' };
}

/**
 * Parses a target project name from user input.
 * Supports:
 * - "Staffcentral IOS Project" -> base: "Staffcentral", platform: "IOS", isPlatformSpecific: true
 * - "Staffcentral AOS Project" -> base: "Staffcentral", platform: "AOS", isPlatformSpecific: true
 * - "Staffcentral" -> base: "Staffcentral", platform: "GENERAL", isPlatformSpecific: false
 * - "[IOS][Staffcentral]" -> base: "Staffcentral", platform: "IOS", isPlatformSpecific: true
 * - "Doorspace AOS" -> base: "Doorspace", platform: "AOS", isPlatformSpecific: true
 */
export function parseTargetProjectItem(targetName: string, config: FormulaConfig): ParsedTargetProject {
  const trimmed = (targetName || '').trim();
  if (!trimmed) {
    return {
      originalInput: '',
      cleanName: '',
      baseProject: '',
      requiredPlatformTag: 'GENERAL',
      isPlatformSpecific: false,
    };
  }

  // 1. Detect if target contains brackets e.g. "[IOS][Staffcentral]" or "[Staffcentral][IOS]"
  const bracketTags = extractBracketTags(trimmed);
  let detectedPlatform: 'IOS' | 'AOS' | 'GENERAL' | string = 'GENERAL';
  let isPlatformSpecific = false;

  const iosKw = (config.iosKeyword || '[IOS]').replace(/[\[\]]/g, '').trim().toUpperCase();
  const aosKw = (config.aosKeyword || '[AOS]').replace(/[\[\]]/g, '').trim().toUpperCase();

  // Check bracket tags for platform
  for (const tag of bracketTags) {
    const upper = tag.toUpperCase().trim();
    if (upper === iosKw || upper === 'IOS' || upper === 'IPHONE') {
      detectedPlatform = 'IOS';
      isPlatformSpecific = true;
    } else if (upper === aosKw || upper === 'AOS' || upper === 'ANDROID') {
      detectedPlatform = 'AOS';
      isPlatformSpecific = true;
    }
  }

  // Check text regex if not found in bracket tags
  if (!isPlatformSpecific) {
    const iosRegex = new RegExp(`(\\b${iosKw}\\b|\\[\\s*IOS\\s*\\]|\\(\\s*IOS\\s*\\)|\\bIOS\\b|\\biOS\\b)`, 'i');
    const aosRegex = new RegExp(`(\\b${aosKw}\\b|\\[\\s*AOS\\s*\\]|\\(\\s*AOS\\s*\\)|\\bAOS\\b|\\bANDROID\\b)`, 'i');

    if (iosRegex.test(trimmed)) {
      detectedPlatform = 'IOS';
      isPlatformSpecific = true;
    } else if (aosRegex.test(trimmed)) {
      detectedPlatform = 'AOS';
      isPlatformSpecific = true;
    }
  }

  // Clean base project name by removing noise words: [IOS], [AOS], IOS, AOS, Project, App, Application, etc.
  let cleanedBase = trimmed;

  // Remove bracket platform tokens
  cleanedBase = cleanedBase
    .replace(/\[\s*IOS\s*\]|\(\s*IOS\s*\)|【\s*IOS\s*】|\[\s*AOS\s*\]|\(\s*AOS\s*\)|【\s*AOS\s*】|\[\s*WEB\s*\]/gi, ' ')
    .replace(/\b(IOS|AOS|Android|iOS)\b/gi, ' ')
    .replace(/\b(PROJECT|APP|APPLICATION)\b/gi, ' ')
    .replace(/[\[\]()【】]/g, ' ')
    .replace(/[\s\-_]+/g, ' ')
    .trim();

  // If cleaning resulted in empty string, fallback to original without brackets
  if (!cleanedBase) {
    cleanedBase = trimmed.replace(/[\[\]()【】]/g, '').trim();
  }

  return {
    originalInput: trimmed,
    cleanName: trimmed,
    baseProject: cleanedBase,
    requiredPlatformTag: detectedPlatform,
    isPlatformSpecific,
  };
}

export interface MatchResult {
  matchedProjectName: string;
  matchedTarget?: ParsedTargetProject;
  matchReason: string;
  platformTag: string;
}

/**
 * Checks if a target project's base name matches the issue's project, summary tags, or summary text.
 */
function isBaseProjectMatch(
  targetBase: string,
  issueBase: string,
  summaryBracketTags: string[]
): boolean {
  if (!targetBase) return false;

  const targetLower = targetBase.toLowerCase().trim();
  const targetCondensed = canonicalizeProjectToken(targetBase);

  // 1. Prefer exact bracket-tag matches so a target such as "workbenchmicroservice"
  // is selected from "[Infosec] [Github-dependabots] [workbenchmicroservice]".
  for (const tag of summaryBracketTags) {
    const tagCondensed = canonicalizeProjectToken(tag);
    if (tagCondensed === targetCondensed) {
      return true;
    }
  }

  // 2. Match normalized bracket tags, including minor name variations.
  for (const tag of summaryBracketTags) {
    const tagLower = tag.toLowerCase().trim();
    const tagCondensed = canonicalizeProjectToken(tag);

    // Skip generic wrapper tags for fuzzy substring matching
    if (GENERIC_WRAPPER_TAGS.has(tagLower) || PLATFORM_TAGS.has(tagLower)) {
      continue;
    }

    // A shorter tag must not qualify a longer target. For example, [Uberticket]
    // must not match the separate "Uberticket Pro max" target.
    if (targetCondensed.length >= 3 && tagCondensed.includes(targetCondensed)) {
      return true;
    }
  }

  // 3. Match with issue's base project column
  if (issueBase) {
    const issueBaseLower = issueBase.toLowerCase().trim();
    const issueBaseCondensed = canonicalizeProjectToken(issueBase);
    if (issueBaseLower === targetLower || issueBaseCondensed === targetCondensed) {
      return true;
    }
    if (issueBaseCondensed.includes(targetCondensed)) {
      return true;
    }
  }

  // 4. Do not match plain summary text; only explicit bracket tags are valid.
  return false;
}

/**
 * Matches an issue against a user-supplied target project list.
 * 
 * Rules:
 * 1. If issue summary contains [IOS] keyword -> counts only in target with IOS requirement (e.g. "Staffcentral IOS Project" or "Genesis IOS").
 * 2. If issue summary contains [AOS] keyword -> counts only in target with AOS requirement (e.g. "Staffcentral AOS Project" or "Genesis AOS").
 * 3. If issue summary has NO [IOS] and NO [AOS] keyword -> counts only in Web/General target (e.g. "Staffcentral" or "Genesis").
 */
export function matchIssueToTargetList(
  issue: IssueRecord,
  parsedTargets: ParsedTargetProject[],
  config: FormulaConfig,
  aliases: ProjectAlias[]
): MatchResult | null {
  if (parsedTargets.length === 0) return null;

  const rawProject = issue.baseProject || issue.project || '';
  const normalizedRaw = normalizeProjectName(rawProject, aliases).trim();
  const { base: baseProjectName, inferredPlatform } = extractBaseProjectName(normalizedRaw);

  const summary = issue.summary || '';
  let issuePlatformTag = detectPlatformTag(summary, config);

  // If summary didn't have a tag, check if raw project name itself had an inferred platform
  if (issuePlatformTag === 'GENERAL' && inferredPlatform && inferredPlatform !== 'GENERAL') {
    issuePlatformTag = inferredPlatform;
  }

  const summaryBracketTags = extractBracketTags(summary);

  // If rawProject is generic (e.g. "Infosec"), extract subproject from summary
  const effectiveBase = GENERIC_WRAPPER_TAGS.has(baseProjectName.toLowerCase())
    ? extractSubprojectFromSummary(summary, baseProjectName)
    : baseProjectName;

  const aiStrippedBase = stripAIPrefix(effectiveBase);
  const matchingBases = [effectiveBase];
  if (aiStrippedBase && aiStrippedBase.toLowerCase() !== effectiveBase.toLowerCase()) {
    matchingBases.push(aiStrippedBase);
  }

  // Explicit AI-prefix remap rule:
  // If issue is "AI <Project>" and no exact "AI <Project>" target exists,
  // map to "<Project>" target (platform-aware first, general fallback).
  const aiSourceCandidates = [
    normalizedRaw,
    rawProject,
    baseProjectName,
    effectiveBase,
    ...summaryBracketTags,
  ]
    .map(value => (value || '').trim())
    .filter(Boolean);

  for (const aiSourceName of aiSourceCandidates) {
    const strippedAiName = stripAIPrefix(aiSourceName);
    const isAiPrefixed = strippedAiName && strippedAiName.toLowerCase() !== aiSourceName.toLowerCase();
    if (!isAiPrefixed) continue;

    const hasExactAiTarget = parsedTargets.some(target =>
      isEquivalentProjectToken(target.cleanName, aiSourceName) || isEquivalentProjectToken(target.baseProject, aiSourceName)
    );
    if (hasExactAiTarget) continue;

    const aiFallbackCandidates = parsedTargets.filter(target =>
      isEquivalentProjectToken(target.cleanName, strippedAiName) || isEquivalentProjectToken(target.baseProject, strippedAiName)
    );
    if (aiFallbackCandidates.length === 0) continue;

    const pickByPlatform = (platform: string) => aiFallbackCandidates.find(target => target.requiredPlatformTag === platform);
    const preferred =
      (issuePlatformTag === 'IOS' ? pickByPlatform('IOS') : undefined) ||
      (issuePlatformTag === 'AOS' ? pickByPlatform('AOS') : undefined) ||
      pickByPlatform('GENERAL') ||
      aiFallbackCandidates[0];

    return {
      matchedProjectName: preferred.cleanName,
      matchedTarget: preferred,
      matchReason: `AI-prefix fallback: mapped "${aiSourceName}" to "${preferred.cleanName}"`,
      platformTag: preferred.requiredPlatformTag || issuePlatformTag || 'GENERAL',
    };
  }

  // A Summary can include several bracket tags. When more than one is in the
  // target list, the final matching tag identifies the owning application.
  for (const tag of [...summaryBracketTags].reverse()) {
    const normalizedTag = tag.toLowerCase().trim().replace(/[\s\-_]+/g, '');
    const target = parsedTargets.find(candidate => {
      if (candidate.requiredPlatformTag === 'IOS' && issuePlatformTag !== 'IOS') return false;
      if (candidate.requiredPlatformTag === 'AOS' && issuePlatformTag !== 'AOS') return false;
      if (candidate.requiredPlatformTag === 'GENERAL' && (issuePlatformTag === 'IOS' || issuePlatformTag === 'AOS')) return false;

      return candidate.baseProject.toLowerCase().trim().replace(/[\s\-_]+/g, '') === normalizedTag;
    });

    if (target) {
      return {
        matchedProjectName: target.cleanName,
        matchedTarget: target,
        matchReason: `Matched final Summary tag [${tag}] to target "${target.cleanName}"`,
        platformTag: target.requiredPlatformTag,
      };
    }
  }

  // Iterate over platform-compatible targets, prioritizing more specific names first.
  // This avoids broad names like "Payroll" capturing records that should map to
  // "Payroll Flow", "Payroll Document", etc.
  const compatibleTargets = parsedTargets.filter(target => {
    if (target.requiredPlatformTag === 'IOS') {
      return issuePlatformTag === 'IOS';
    }
    if (target.requiredPlatformTag === 'AOS') {
      return issuePlatformTag === 'AOS';
    }
    // General/Web target: must not be IOS/AOS issue.
    return issuePlatformTag !== 'IOS' && issuePlatformTag !== 'AOS';
  });

  const rankedTargets = [...compatibleTargets].sort((left, right) => {
    const leftLen = left.baseProject.trim().length;
    const rightLen = right.baseProject.trim().length;
    if (rightLen !== leftLen) return rightLen - leftLen;

    // Stable secondary ordering for deterministic matches.
    return left.cleanName.localeCompare(right.cleanName);
  });

  for (const target of rankedTargets) {
    const isMatched = matchingBases.some(baseCandidate =>
      isBaseProjectMatch(
        target.baseProject,
        baseCandidate,
        summaryBracketTags
      )
    );

    if (isMatched) {
      return {
        matchedProjectName: target.cleanName,
        matchedTarget: target,
        matchReason: `Matched target "${target.cleanName}" (${target.requiredPlatformTag}) with summary [${effectiveBase}]`,
        platformTag: target.requiredPlatformTag,
      };
    }
  }

  // Fallback: Direct exact matching on clean name or base project if platform is compatible
  const directTarget = parsedTargets.find(t => {
    // Strict platform constraint
    if (t.requiredPlatformTag === 'IOS' && issuePlatformTag !== 'IOS') return false;
    if (t.requiredPlatformTag === 'AOS' && issuePlatformTag !== 'AOS') return false;
    if (t.requiredPlatformTag === 'GENERAL' && (issuePlatformTag === 'IOS' || issuePlatformTag === 'AOS')) return false;

    const tClean = t.cleanName.toLowerCase();
    const tBase = t.baseProject.toLowerCase();
    const rawLower = normalizedRaw.toLowerCase();
    const effLower = effectiveBase.toLowerCase();
    const rawWithoutAi = stripAIPrefix(normalizedRaw).toLowerCase();
    const effWithoutAi = stripAIPrefix(effectiveBase).toLowerCase();

    return (
      tClean === rawLower ||
      tClean === effLower ||
      tBase === rawLower ||
      tBase === effLower ||
      (rawWithoutAi && (tClean === rawWithoutAi || tBase === rawWithoutAi)) ||
      (effWithoutAi && (tClean === effWithoutAi || tBase === effWithoutAi))
    );
  });

  if (directTarget) {
    return {
      matchedProjectName: directTarget.cleanName,
      matchedTarget: directTarget,
      matchReason: `Direct project match: "${directTarget.cleanName}"`,
      platformTag: directTarget.requiredPlatformTag || issuePlatformTag || 'GENERAL',
    };
  }

  return null;
}
