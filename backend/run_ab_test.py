"""
Run full A/B test with real test cases
Phase 2 Completion
"""
import asyncio
from core.evaluation.ab_test import ABTestFramework
from core.utils.logger import logger

# Real test cases covering diverse scenarios
TEST_CASES = [
    # File operations
    "Create a Python file called hello.py with a hello world function",
    "Read the contents of package.json and show me the dependencies",
    "List all Python files in the current directory",
    
    # Web search
    "Search for the latest news about AI developments",
    "Find information about Python 3.12 new features",
    
    # Code development
    "Write a function to calculate fibonacci numbers",
    "Create a REST API endpoint for user authentication",
    
    # Data processing
    "Parse this JSON data and extract the user names",
    "Convert CSV data to JSON format",
    
    # Workflow
    "Create a new project structure for a React app",
    "Set up a Python virtual environment and install dependencies",
    
    # Content creation
    "Write a blog post about machine learning",
    "Create a README file for a GitHub project",
    
    # Complex queries
    "Build a todo app with React and save data to localStorage",
    "Analyze this code and suggest improvements",
    
    # Tool calling
    "Upload a file to cloud storage",
    "Take a screenshot of a website",
]

async def main():
    """Run A/B test"""
    logger.info("=" * 80)
    logger.info("PHASE 2 COMPLETION: Full A/B Test")
    logger.info("=" * 80)
    
    # Initialize framework
    framework = ABTestFramework()
    
    # Run A/B test
    logger.info(f"\n🧪 Running A/B test with {len(TEST_CASES)} real test cases...")
    logger.info("This may take several minutes...\n")
    
    try:
        results = await framework.run_ab_test(
            test_cases=TEST_CASES,
            model="claude-sonnet-4"
        )
        
        # Display results
        logger.info("\n" + "=" * 80)
        logger.info("A/B TEST RESULTS")
        logger.info("=" * 80)
        
        logger.info(f"\n📊 Test Summary:")
        logger.info(f"   Total test cases: {results['total_cases']}")
        logger.info(f"   Winner: {results['winner'].upper()}")
        logger.info(f"   Passed: {'✅ YES' if results['passed'] else '❌ NO'}")
        
        logger.info(f"\n📈 Monolithic Prompt:")
        logger.info(f"   Average quality: {results['monolithic']['avg_quality']:.3f}")
        logger.info(f"   Success rate: {results['monolithic']['success_rate']:.1f}%")
        logger.info(f"   Errors: {results['monolithic']['error_count']}")
        
        logger.info(f"\n📈 Modular Prompt:")
        logger.info(f"   Average quality: {results['modular']['avg_quality']:.3f}")
        logger.info(f"   Success rate: {results['modular']['success_rate']:.1f}%")
        logger.info(f"   Errors: {results['modular']['error_count']}")
        
        logger.info(f"\n📊 Comparison:")
        logger.info(f"   Quality difference: {results['quality_diff']:+.3f} ({results['quality_diff_pct']:+.2f}%)")
        
        if results['passed']:
            logger.info(f"\n✅ SUCCESS: Modular prompt >= 98% of monolithic quality")
            logger.info(f"   Modular is {results['quality_diff_pct']:+.2f}% {'better' if results['quality_diff'] > 0 else 'worse'} than monolithic")
        else:
            logger.info(f"\n❌ FAILED: Modular prompt < 98% of monolithic quality")
            logger.info(f"   Need to improve modular prompt")
        
        logger.info("\n" + "=" * 80)
        
        # Log to GlitchTip
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                f"Full A/B Test Complete: {results['winner']} wins, passed={results['passed']}",
                level="info",
                extras=results
            )
        except Exception as e:
            logger.warning(f"Failed to log to GlitchTip: {e}")
        
        return results
        
    except Exception as e:
        logger.error(f"❌ A/B test failed: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    asyncio.run(main())

