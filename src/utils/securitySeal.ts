import { ProjectSummary, SecuritySeal, SeverityBreakdown } from '../types';

export const SECURITY_SEAL_ORDER: SecuritySeal[] = [
  'Secure',
  'Protected',
  'Defended',
  'Vulnerable',
  'Exposed',
  'Compromised',
];

export interface SecuritySealResult {
  seal: SecuritySeal;
  severity: SeverityBreakdown;
}

function getSeveritySeal(severity: SeverityBreakdown): SecuritySeal {
  const { critical, high, medium, low } = severity;

  // Security Seal matrix: Critical findings dominate, followed by High,
  // then Medium and Low findings. The most severe applicable band wins.
  if (critical >= 51 || high >= 51 || medium >= 51 || low >= 51) return 'Compromised';
  if (critical >= 1) return 'Exposed';
  if (high >= 31) return 'Vulnerable';
  if (high >= 1 || medium >= 31 || low >= 31) return 'Defended';
  if (medium >= 16 || low >= 16) return 'Protected';
  return 'Secure';
}

export function getProjectSecuritySeal(summary: ProjectSummary): SecuritySealResult {
  return {
    seal: getSeveritySeal(summary.outstandingBySeverity),
    severity: summary.outstandingBySeverity,
  };
}