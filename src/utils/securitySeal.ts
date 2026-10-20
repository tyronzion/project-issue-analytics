import { ProjectSummary, SecuritySeal, SeverityBreakdown } from '../types';
import { sealFromCounts } from '../../tracker/shared/report.js';

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

// Security Seal from the outstanding issues per severity: the team's spreadsheet formula, shared with the
// assessment report (tracker/shared/report.js).
export function getProjectSecuritySeal(summary: ProjectSummary): SecuritySealResult {
  return {
    seal: sealFromCounts(summary.outstandingBySeverity) as SecuritySeal,
    severity: summary.outstandingBySeverity,
  };
}
