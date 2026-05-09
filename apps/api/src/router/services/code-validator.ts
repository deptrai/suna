import { ValidationWarning } from '../../types';

export interface ValidationRule {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  pattern: RegExp;
  message: string;
}

export const SOLIDITY_RULES: ValidationRule[] = [
  {
    id: 'reentrancy',
    severity: 'HIGH',
    pattern: /\.call\s*\{value[^}]*\}|\.call\s*\.value\s*\(/,
    message: 'External call before state update — potential reentrancy. Move state changes BEFORE external calls.'
  },
  {
    id: 'unchecked-call',
    severity: 'MEDIUM',
    pattern: /\.(call|send|delegatecall)(\{[^}]*\})?\s*\(/,
    message: 'External call detected — verify return value is checked and state is updated BEFORE this call (reentrancy).'
  },
  {
    id: 'old-pragma',
    severity: 'MEDIUM',
    pattern: /pragma\s+solidity\s+[\^~>=<]*0\.[0-7]\./,
    message: 'Solidity <0.8.0 detected. Integer overflow/underflow not protected by default. Use SafeMath or upgrade to >=0.8.0.'
  },
  {
    id: 'tx-origin',
    severity: 'MEDIUM',
    pattern: /tx\.origin/,
    message: 'tx.origin used for auth — vulnerable to phishing attacks. Use msg.sender instead.'
  },
  {
    id: 'selfdestruct',
    severity: 'LOW',
    pattern: /selfdestruct\s*\(/,
    message: 'selfdestruct detected. Consider implications for contract lifecycle.'
  }
];

export const MOVE_RULES: ValidationRule[] = [
  {
    id: 'unguarded-borrow',
    severity: 'HIGH',
    pattern: /borrow_global_mut\s*</,
    message: 'borrow_global_mut usage — ensure access control guards are in place.'
  },
  {
    id: 'assert-magic-number',
    severity: 'MEDIUM',
    pattern: /assert!\s*\([^,]+,\s*\d+\s*\)/,
    message: 'assert! with hardcoded error code. Define named error constants for maintainability.'
  }
];

export function validateCode(code: string, language: 'solidity' | 'move'): ValidationWarning[] {
  const rules = language === 'solidity' ? SOLIDITY_RULES : MOVE_RULES;
  const lines = code.split('\n');
  const warnings: ValidationWarning[] = [];

  rules.forEach(rule => {
    lines.forEach((line, idx) => {
      if (line.trim().startsWith('//')) return;
      if (rule.pattern.test(line)) {
        warnings.push({
          severity: rule.severity,
          rule: rule.id,
          message: rule.message,
          line: idx + 1
        });
      }
    });
  });

  // Sort warnings: HIGH -> MEDIUM -> LOW, then by line asc
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  warnings.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return (a.line || 0) - (b.line || 0);
  });

  return warnings;
}

export const DISCLAIMER = 'AI-generated code has not been professionally audited. Do not deploy to mainnet without independent review.';

export function formatReport(language: 'solidity' | 'move', warnings: ValidationWarning[], sandboxRecommended: boolean): string {
  const capLanguage = language.charAt(0).toUpperCase() + language.slice(1);
  let report = `## Code Validation Report (${capLanguage})\n`;

  if (warnings.length === 0) {
    report += `✅ No critical issues detected.\n\n`;
  } else {
    const highCount = warnings.filter(w => w.severity === 'HIGH').length;
    const medCount = warnings.filter(w => w.severity === 'MEDIUM').length;
    const lowCount = warnings.filter(w => w.severity === 'LOW').length;
    
    report += `⚠️ **${warnings.length} warning(s) found** (${highCount} HIGH, ${medCount} MEDIUM, ${lowCount} LOW)\n\n`;
    report += `| Severity | Rule | Line | Message |\n`;
    report += `|----------|------|------|---------|\n`;
    
    warnings.forEach(w => {
      const emoji = w.severity === 'HIGH' ? '🔴' : w.severity === 'MEDIUM' ? '🟡' : '⚪';
      report += `| ${emoji} ${w.severity} | ${w.rule} | ${w.line || 'N/A'} | ${w.message} |\n`;
    });
    report += `\n`;
  }

  report += `> ⚠️ **DISCLAIMER:** ${DISCLAIMER}\n`;
  if (sandboxRecommended) {
    report += `> 🔬 **Sandbox testing recommended** before execution (HIGH severity issues found).\n`;
  }

  return report.trim();
}
