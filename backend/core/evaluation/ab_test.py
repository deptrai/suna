"""
A/B Testing Framework
Phase 2 Task 2.2.2

Compares modular vs monolithic prompt performance.
"""
import asyncio
from typing import List, Dict, Any, Optional
from core.utils.logger import logger
from core.evaluation.evaluator import AutomatedEvaluator
from core.prompts.module_manager import ModularPromptBuilder, PromptModule
from core.prompts.prompt import SYSTEM_PROMPT
from core.agentpress.thread_manager import ThreadManager


class ABTestFramework:
    """
    A/B testing framework for comparing prompt versions.
    
    Tests:
    - Monolithic vs Modular prompts
    - Quality comparison
    - Performance comparison
    - Cost comparison
    """
    
    def __init__(self):
        """Initialize A/B test framework"""
        self.evaluator = AutomatedEvaluator()
        self.builder = ModularPromptBuilder()
        self.thread_manager = ThreadManager()
        logger.info("🧪 ABTestFramework initialized")
    
    async def run_ab_test(
        self, 
        test_cases: List[str],
        model: str = "claude-sonnet-4"
    ) -> Dict[str, Any]:
        """
        Run A/B test comparing monolithic vs modular prompts.
        
        Args:
            test_cases: List of test queries
            model: LLM model to use
        
        Returns:
            Test results with comparison
        """
        logger.info(f"🧪 Starting A/B test with {len(test_cases)} test cases")
        
        results = {
            'monolithic': {
                'success_count': 0,
                'quality_scores': [],
                'latencies': [],
                'errors': []
            },
            'modular': {
                'success_count': 0,
                'quality_scores': [],
                'latencies': [],
                'errors': []
            }
        }
        
        for i, test_case in enumerate(test_cases):
            logger.info(f"🧪 Test case {i+1}/{len(test_cases)}: {test_case[:50]}...")
            
            # Test monolithic
            try:
                mono_result = await self._test_monolithic(test_case, model)
                results['monolithic']['quality_scores'].append(mono_result['overall_score'])
                results['monolithic']['latencies'].append(mono_result.get('latency', 0))
                if mono_result['passed']:
                    results['monolithic']['success_count'] += 1
            except Exception as e:
                logger.error(f"❌ Monolithic test failed: {e}")
                results['monolithic']['errors'].append(str(e))
            
            # Test modular
            try:
                mod_result = await self._test_modular(test_case, model)
                results['modular']['quality_scores'].append(mod_result['overall_score'])
                results['modular']['latencies'].append(mod_result.get('latency', 0))
                if mod_result['passed']:
                    results['modular']['success_count'] += 1
            except Exception as e:
                logger.error(f"❌ Modular test failed: {e}")
                results['modular']['errors'].append(str(e))
        
        # Calculate statistics
        comparison = self._calculate_comparison(results, len(test_cases))
        
        # Log results
        logger.info(f"🧪 A/B Test Complete:")
        logger.info(f"   Monolithic: {comparison['monolithic']['avg_quality']:.3f} quality, {comparison['monolithic']['success_rate']:.1f}% success")
        logger.info(f"   Modular: {comparison['modular']['avg_quality']:.3f} quality, {comparison['modular']['success_rate']:.1f}% success")
        logger.info(f"   Winner: {comparison['winner']}")
        
        # Log to GlitchTip
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                f"A/B Test: modular={comparison['modular']['avg_quality']:.3f}, monolithic={comparison['monolithic']['avg_quality']:.3f}, passed={comparison['passed']}",
                level="info",
                extras=comparison
            )
        except Exception as e:
            logger.warning(f"Failed to log A/B test to GlitchTip: {e}")
        
        return comparison
    
    async def _test_monolithic(self, test_case: str, model: str) -> Dict[str, Any]:
        """Test with monolithic prompt"""
        self.evaluator.start_timer()
        
        # Create thread
        thread_id = await self.thread_manager.create_thread(
            account_id="00000000-0000-0000-0000-000000000001",
            is_public=False
        )
        
        # Add message
        await self.thread_manager.add_message(
            thread_id=thread_id,
            role="user",
            content=test_case
        )
        
        # Run with monolithic prompt
        response = await self.thread_manager.run_thread(
            thread_id=thread_id,
            system_prompt={"role": "system", "content": SYSTEM_PROMPT},
            llm_model=model,
            enable_prompt_caching=True,
            native_max_auto_continues=0
        )
        
        # Evaluate
        result = self.evaluator.evaluate_response(
            response,
            prompt_version="monolithic"
        )
        
        return result
    
    async def _test_modular(self, test_case: str, model: str) -> Dict[str, Any]:
        """Test with modular prompt"""
        self.evaluator.start_timer()
        
        # Build modular prompt (for now, use all modules)
        # In Phase 3, we'll add dynamic routing
        modular_prompt = self.builder.build_prompt()
        
        # Create thread
        thread_id = await self.thread_manager.create_thread(
            account_id="00000000-0000-0000-0000-000000000001",
            is_public=False
        )
        
        # Add message
        await self.thread_manager.add_message(
            thread_id=thread_id,
            role="user",
            content=test_case
        )
        
        # Run with modular prompt
        response = await self.thread_manager.run_thread(
            thread_id=thread_id,
            system_prompt={"role": "system", "content": modular_prompt},
            llm_model=model,
            enable_prompt_caching=True,
            native_max_auto_continues=0
        )
        
        # Evaluate
        result = self.evaluator.evaluate_response(
            response,
            prompt_version="modular_v1"
        )
        
        return result
    
    def _calculate_comparison(
        self, 
        results: Dict[str, Any], 
        total_cases: int
    ) -> Dict[str, Any]:
        """Calculate comparison statistics"""
        
        # Monolithic stats
        mono_scores = results['monolithic']['quality_scores']
        mono_avg = sum(mono_scores) / len(mono_scores) if mono_scores else 0
        mono_success_rate = (results['monolithic']['success_count'] / total_cases * 100) if total_cases > 0 else 0
        
        # Modular stats
        mod_scores = results['modular']['quality_scores']
        mod_avg = sum(mod_scores) / len(mod_scores) if mod_scores else 0
        mod_success_rate = (results['modular']['success_count'] / total_cases * 100) if total_cases > 0 else 0
        
        # Determine winner
        if mod_avg >= mono_avg * 0.98:  # Modular must be >= 98% of monolithic
            winner = "modular"
            passed = True
        else:
            winner = "monolithic"
            passed = False
        
        comparison = {
            "total_cases": total_cases,
            "monolithic": {
                "avg_quality": round(mono_avg, 3),
                "success_rate": round(mono_success_rate, 1),
                "error_count": len(results['monolithic']['errors'])
            },
            "modular": {
                "avg_quality": round(mod_avg, 3),
                "success_rate": round(mod_success_rate, 1),
                "error_count": len(results['modular']['errors'])
            },
            "winner": winner,
            "passed": passed,
            "quality_diff": round(mod_avg - mono_avg, 3),
            "quality_diff_pct": round((mod_avg / mono_avg - 1) * 100, 2) if mono_avg > 0 else 0
        }
        
        return comparison


# Singleton instance
_ab_test_instance: Optional[ABTestFramework] = None


def get_ab_test_framework() -> ABTestFramework:
    """Get singleton instance of ABTestFramework"""
    global _ab_test_instance
    if _ab_test_instance is None:
        _ab_test_instance = ABTestFramework()
    return _ab_test_instance

