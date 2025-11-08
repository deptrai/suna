#!/usr/bin/env python3
"""
CI/CD Gate Decision Enforcer

Reads gate decision YAML file and enforces quality gate decisions.
Exits with appropriate exit codes for CI/CD integration.

Usage:
    python scripts/enforce-gate-decision.py <gate-decision-yaml-path> [--strict] [--verbose]

Exit Codes:
    0 - PASS: All gate criteria met, proceed with deployment
    1 - FAIL: Gate criteria not met, block deployment
    2 - CONCERNS: Minor issues, proceed with caution (non-blocking unless --strict)
    3 - WAIVED: Gate decision waived (non-blocking unless --strict)
    4 - ERROR: Invalid gate decision file or processing error
"""

import sys
import yaml
import argparse
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime


class GateDecisionEnforcer:
    """Enforce quality gate decisions from YAML file."""
    
    # Gate decision mapping to exit codes
    DECISION_EXIT_CODES = {
        'PASS': 0,
        'CONCERNS': 2,
        'FAIL': 1,
        'WAIVED': 3,
    }
    
    # Thresholds for gate decision validation
    DEFAULT_THRESHOLDS = {
        'min_p0_coverage': 100,
        'min_p0_pass_rate': 100,
        'min_p1_coverage': 90,
        'min_p1_pass_rate': 95,
        'min_overall_pass_rate': 90,
        'min_coverage': 80,
    }
    
    def __init__(self, gate_file: Path, strict: bool = False, verbose: bool = False):
        self.gate_file = gate_file
        self.strict = strict
        self.verbose = verbose
        self.gate_data: Optional[Dict[str, Any]] = None
        
    def load_gate_decision(self) -> bool:
        """Load gate decision YAML file."""
        try:
            if not self.gate_file.exists():
                print(f"❌ ERROR: Gate decision file not found: {self.gate_file}")
                return False
                
            with open(self.gate_file, 'r') as f:
                self.gate_data = yaml.safe_load(f)
                
            if not self.gate_data:
                print(f"❌ ERROR: Gate decision file is empty: {self.gate_file}")
                return False
                
            if 'traceability_and_gate' not in self.gate_data:
                print(f"❌ ERROR: Invalid gate decision file format: {self.gate_file}")
                return False
                
            return True
            
        except yaml.YAMLError as e:
            print(f"❌ ERROR: Failed to parse YAML file: {e}")
            return False
        except Exception as e:
            print(f"❌ ERROR: Failed to read gate decision file: {e}")
            return False
    
    def validate_criteria(self) -> tuple[bool, list[str]]:
        """Validate gate decision criteria against thresholds."""
        if not self.gate_data:
            return False, ["Gate data not loaded"]
            
        gate = self.gate_data['traceability_and_gate']
        gate_decision = gate.get('gate_decision', {})
        criteria = gate_decision.get('criteria', {})
        thresholds = gate_decision.get('thresholds', self.DEFAULT_THRESHOLDS)
        
        issues = []
        all_pass = True
        
        # Check P0 coverage
        p0_coverage = criteria.get('p0_coverage', 0)
        min_p0_coverage = thresholds.get('min_p0_coverage', 100)
        if p0_coverage < min_p0_coverage:
            issues.append(f"P0 coverage {p0_coverage}% < {min_p0_coverage}% (BLOCKER)")
            all_pass = False
            
        # Check P0 pass rate
        p0_pass_rate = criteria.get('p0_pass_rate', 0)
        min_p0_pass_rate = thresholds.get('min_p0_pass_rate', 100)
        if p0_pass_rate < min_p0_pass_rate:
            issues.append(f"P0 pass rate {p0_pass_rate}% < {min_p0_pass_rate}% (BLOCKER)")
            all_pass = False
            
        # Check P1 coverage
        p1_coverage = criteria.get('p1_coverage', 0)
        min_p1_coverage = thresholds.get('min_p1_coverage', 90)
        if p1_coverage < min_p1_coverage:
            issues.append(f"P1 coverage {p1_coverage}% < {min_p1_coverage}% (WARNING)")
            # P1 issues don't block unless strict mode
            
        # Check overall coverage
        overall_coverage = criteria.get('overall_coverage', 0)
        min_coverage = thresholds.get('min_coverage', 80)
        if overall_coverage < min_coverage:
            issues.append(f"Overall coverage {overall_coverage}% < {min_coverage}% (WARNING)")
            all_pass = False
            
        # Check security issues
        security_issues = criteria.get('security_issues', 0)
        if security_issues > 0:
            issues.append(f"Security issues found: {security_issues} (BLOCKER)")
            all_pass = False
            
        # Check critical NFR failures
        critical_nfrs_fail = criteria.get('critical_nfrs_fail', 0)
        if critical_nfrs_fail > 0:
            issues.append(f"Critical NFR failures: {critical_nfrs_fail} (BLOCKER)")
            all_pass = False
            
        return all_pass, issues
    
    def enforce(self) -> int:
        """Enforce gate decision and return exit code."""
        if not self.load_gate_decision():
            return 4
            
        gate = self.gate_data['traceability_and_gate']
        gate_decision = gate.get('gate_decision', {})
        decision = gate_decision.get('decision', 'FAIL').upper()
        story_id = gate.get('traceability', {}).get('story_id', 'unknown')
        
        if self.verbose:
            print(f"📋 Gate Decision File: {self.gate_file}")
            print(f"📊 Story ID: {story_id}")
            print(f"🎯 Decision: {decision}")
            print()
            
        # Validate criteria
        criteria_pass, issues = self.validate_criteria()
        
        if self.verbose:
            criteria = gate_decision.get('criteria', {})
            thresholds = gate_decision.get('thresholds', {})
            print("📈 Criteria Evaluation:")
            print(f"  - P0 Coverage: {criteria.get('p0_coverage', 0)}% (threshold: {thresholds.get('min_p0_coverage', 100)}%)")
            print(f"  - P1 Coverage: {criteria.get('p1_coverage', 0)}% (threshold: {thresholds.get('min_p1_coverage', 90)}%)")
            print(f"  - Overall Coverage: {criteria.get('overall_coverage', 0)}% (threshold: {thresholds.get('min_coverage', 80)}%)")
            print(f"  - Security Issues: {criteria.get('security_issues', 0)}")
            print()
            
        # Determine exit code based on decision
        exit_code = self.DECISION_EXIT_CODES.get(decision, 1)
        
        # Override exit code based on validation results
        if not criteria_pass and decision in ['PASS', 'CONCERNS']:
            if self.verbose:
                print("⚠️  WARNING: Decision is PASS/CONCERNS but criteria validation failed:")
                for issue in issues:
                    print(f"   - {issue}")
                print()
            # If strict mode, treat validation failures as blocking
            if self.strict:
                exit_code = 1  # FAIL
                
        # Print decision summary
        decision_icons = {
            'PASS': '✅',
            'CONCERNS': '⚠️',
            'FAIL': '❌',
            'WAIVED': '🔓',
        }
        icon = decision_icons.get(decision, '❓')
        
        print(f"{icon} Gate Decision: {decision}")
        print(f"📋 Story: {story_id}")
        
        if issues and self.verbose:
            print("\n⚠️  Validation Issues:")
            for issue in issues:
                print(f"   - {issue}")
            print()
            
        # Print recommendation
        deployment = gate_decision.get('deployment', {})
        if not deployment:
            # Try top-level deployment if not in gate_decision
            deployment = gate.get('deployment', {})
        recommendation = deployment.get('recommendation', 'UNKNOWN')
        if recommendation and recommendation != 'UNKNOWN':
            print(f"💡 Recommendation: {recommendation}")
            
        # Print next steps if concerns or fail
        if decision in ['CONCERNS', 'FAIL']:
            next_steps = gate_decision.get('next_steps', [])
            if next_steps:
                print("\n📋 Next Steps:")
                for step in next_steps:
                    print(f"   - {step}")
                    
        # Print waiver info if waived
        if decision == 'WAIVED':
            waiver = gate_decision.get('waiver', {})
            if waiver:
                print(f"\n🔓 Waiver Details:")
                print(f"   - Reason: {waiver.get('reason', 'N/A')}")
                print(f"   - Approver: {waiver.get('approver', 'N/A')}")
                print(f"   - Expiry: {waiver.get('expiry', 'N/A')}")
                
        print()
        
        # Determine final exit code
        if decision == 'FAIL':
            return 1  # Block deployment
        elif decision == 'PASS':
            return 0  # Proceed with deployment
        elif decision == 'WAIVED':
            # In strict mode, waived decisions still block
            if self.strict:
                return 1
            return 3  # Non-blocking waiver
        elif decision == 'CONCERNS':
            # In strict mode, concerns block deployment
            if self.strict:
                return 1
            # Check if criteria validation failed
            if not criteria_pass:
                return 1  # Block if critical criteria failed
            return 2  # Non-blocking concerns
        else:
            print(f"❌ ERROR: Unknown gate decision: {decision}")
            return 4


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Enforce quality gate decisions from YAML file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        'gate_file',
        type=Path,
        help='Path to gate decision YAML file'
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Strict mode: Treat CONCERNS and WAIVED as blocking'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Verbose output with detailed criteria evaluation'
    )
    
    args = parser.parse_args()
    
    enforcer = GateDecisionEnforcer(
        gate_file=args.gate_file,
        strict=args.strict,
        verbose=args.verbose
    )
    
    exit_code = enforcer.enforce()
    sys.exit(exit_code)


if __name__ == '__main__':
    main()

