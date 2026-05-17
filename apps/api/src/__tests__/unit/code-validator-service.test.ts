import { describe, test, expect } from 'bun:test';
import {
  validateCode,
  formatReport,
  DISCLAIMER,
  SOLIDITY_RULES,
  MOVE_RULES,
} from '../../router/services/code-validator';

describe('validateCode — Solidity rules', () => {
  test('[P0] detects reentrancy via .call{value}', () => {
    const code = `
function withdraw() external {
  msg.sender.call{value: 1 ether}("");
}`;
    const warnings = validateCode(code, 'solidity');
    const reentrancy = warnings.find(w => w.rule === 'reentrancy');
    expect(reentrancy).toBeDefined();
    expect(reentrancy?.severity).toBe('HIGH');
  });

  test('[P0] detects reentrancy via .call.value() (legacy syntax)', () => {
    const code = `addr.call.value(1 ether)("");`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings.some(w => w.rule === 'reentrancy')).toBe(true);
  });

  test('[P0] detects unchecked external call', () => {
    const code = `addr.send(1 ether);`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings.some(w => w.rule === 'unchecked-call')).toBe(true);
  });

  test('[P0] detects old solidity pragma <0.8.0', () => {
    const code = `pragma solidity ^0.7.6;`;
    const warnings = validateCode(code, 'solidity');
    const pragma = warnings.find(w => w.rule === 'old-pragma');
    expect(pragma).toBeDefined();
    expect(pragma?.severity).toBe('MEDIUM');
  });

  test('[P0] does NOT flag solidity pragma >=0.8.0', () => {
    const code = `pragma solidity ^0.8.20;`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings.some(w => w.rule === 'old-pragma')).toBe(false);
  });

  test('[P0] detects tx.origin usage', () => {
    const code = `require(tx.origin == owner);`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings.some(w => w.rule === 'tx-origin')).toBe(true);
  });

  test('[P0] detects selfdestruct', () => {
    const code = `selfdestruct(payable(owner));`;
    const warnings = validateCode(code, 'solidity');
    const sd = warnings.find(w => w.rule === 'selfdestruct');
    expect(sd?.severity).toBe('LOW');
  });

  test('[P0] returns empty array for clean code', () => {
    const code = `
pragma solidity ^0.8.20;
contract Safe {
  uint256 public value;
  function set(uint256 v) external { value = v; }
}`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings).toEqual([]);
  });

  test('[P0] skips comments (// prefix)', () => {
    const code = `
// tx.origin == owner
// addr.call{value: 1}("")
uint256 x = 1;`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings.length).toBe(0);
  });

  test('[P1] sorts warnings HIGH → MEDIUM → LOW, then by line ascending', () => {
    const code = `
pragma solidity ^0.7.0;
require(tx.origin == owner);
selfdestruct(payable(owner));
msg.sender.call{value: 1}("");`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings[0].severity).toBe('HIGH'); // reentrancy
    const lastWarning = warnings[warnings.length - 1];
    expect(lastWarning.severity).toBe('LOW'); // selfdestruct
  });

  test('[P1] reports correct line number (1-indexed)', () => {
    const code = `// line 1
// line 2
require(tx.origin == owner); // line 3`;
    const warnings = validateCode(code, 'solidity');
    expect(warnings[0].line).toBe(3);
  });
});

describe('validateCode — Move rules', () => {
  test('[P0] detects unguarded borrow_global_mut', () => {
    const code = `let r = borrow_global_mut<Coin>(addr);`;
    const warnings = validateCode(code, 'move');
    const borrow = warnings.find(w => w.rule === 'unguarded-borrow');
    expect(borrow?.severity).toBe('HIGH');
  });

  test('[P0] detects assert! with magic number', () => {
    const code = `assert!(condition, 42);`;
    const warnings = validateCode(code, 'move');
    expect(warnings.some(w => w.rule === 'assert-magic-number')).toBe(true);
  });

  test('[P0] does NOT apply solidity rules to move code', () => {
    const code = `let x = tx.origin;`; // would match solidity tx-origin rule
    const warnings = validateCode(code, 'move');
    expect(warnings.length).toBe(0);
  });

  test('[P0] returns empty for clean Move code', () => {
    const code = `
module m::test {
  use std::vector;
  fun new(): vector<u8> { vector::empty() }
}`;
    const warnings = validateCode(code, 'move');
    expect(warnings).toEqual([]);
  });
});

describe('formatReport', () => {
  test('[P0] returns clean report when no warnings', () => {
    const report = formatReport('solidity', [], false);
    expect(report).toContain('No critical issues');
    expect(report).toContain(DISCLAIMER);
  });

  test('[P0] includes warning count summary by severity', () => {
    const report = formatReport('solidity', [
      { severity: 'HIGH', rule: 'reentrancy', message: 'r', line: 1 },
      { severity: 'MEDIUM', rule: 'tx-origin', message: 't', line: 2 },
      { severity: 'LOW', rule: 'selfdestruct', message: 's', line: 3 },
    ], true);
    expect(report).toContain('3 warning(s)');
    expect(report).toContain('1 HIGH');
    expect(report).toContain('1 MEDIUM');
    expect(report).toContain('1 LOW');
  });

  test('[P0] adds sandbox recommendation when sandboxRecommended=true', () => {
    const report = formatReport('solidity', [
      { severity: 'HIGH', rule: 'reentrancy', message: 'r', line: 1 },
    ], true);
    expect(report).toContain('Sandbox testing recommended');
  });

  test('[P0] does NOT add sandbox recommendation when sandboxRecommended=false', () => {
    const report = formatReport('solidity', [], false);
    expect(report).not.toContain('Sandbox testing recommended');
  });

  test('[P0] always includes DISCLAIMER', () => {
    const report = formatReport('move', [], false);
    expect(report).toContain(DISCLAIMER);
  });

  test('[P1] capitalizes language name', () => {
    const reportSol = formatReport('solidity', [], false);
    expect(reportSol).toContain('Solidity');
    const reportMove = formatReport('move', [], false);
    expect(reportMove).toContain('Move');
  });

  test('[P1] table includes rule name and line for each warning', () => {
    const report = formatReport('solidity', [
      { severity: 'HIGH', rule: 'reentrancy', message: 'msg', line: 42 },
    ], true);
    expect(report).toContain('reentrancy');
    expect(report).toContain('42');
  });
});

describe('Rules constants', () => {
  test('[P0] SOLIDITY_RULES has expected rule ids', () => {
    const ids = SOLIDITY_RULES.map(r => r.id);
    expect(ids).toContain('reentrancy');
    expect(ids).toContain('unchecked-call');
    expect(ids).toContain('old-pragma');
    expect(ids).toContain('tx-origin');
    expect(ids).toContain('selfdestruct');
  });

  test('[P0] MOVE_RULES has expected rule ids', () => {
    const ids = MOVE_RULES.map(r => r.id);
    expect(ids).toContain('unguarded-borrow');
    expect(ids).toContain('assert-magic-number');
  });
});
