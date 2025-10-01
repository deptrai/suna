"""
Simple A/B test to validate setup
"""
import asyncio
from core.evaluation.ab_test import ABTestFramework
from core.utils.logger import logger

# Simple test cases
TEST_CASES = [
    "Hello, how are you?",
    "What is 2+2?",
    "Tell me a joke",
]

async def main():
    """Run simple A/B test"""
    logger.info("🧪 Running simple A/B test...")
    
    framework = ABTestFramework()
    
    results = await framework.run_ab_test(
        test_cases=TEST_CASES,
        model="claude-sonnet-4"
    )
    
    logger.info(f"\n✅ Test complete!")
    logger.info(f"   Winner: {results['winner']}")
    logger.info(f"   Passed: {results['passed']}")
    logger.info(f"   Monolithic: {results['monolithic']['avg_quality']:.3f}")
    logger.info(f"   Modular: {results['modular']['avg_quality']:.3f}")
    
    return results

if __name__ == "__main__":
    asyncio.run(main())

