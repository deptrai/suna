"""
Large-scale test suite for semantic vs keyword routing.
Goal: 384+ queries for statistical significance.
"""

import sys
import structlog
from core.prompts.router import get_router
from core.prompts.semantic_router import get_semantic_router

logger = structlog.get_logger()

# 384+ diverse test queries covering all use cases
TEST_QUERIES = [
    # === FILE OPERATIONS (toolkit) - 80 queries ===
    "Create a new file",
    "Edit this file",
    "Read the contents of file.txt",
    "Delete old files",
    "List all files in directory",
    "Move file to another folder",
    "Copy file to backup",
    "Rename this file",
    "Search for files matching pattern",
    "Find all Python files",
    "Show me the file structure",
    "Open file in editor",
    "Save changes to file",
    "Write text to file",
    "Append data to file",
    "Create a new directory",
    "Remove empty directories",
    "Check if file exists",
    "Get file size",
    "View file permissions",
    "Change file permissions",
    "Create symbolic link",
    "Compress files into archive",
    "Extract archive contents",
    "Upload file to server",
    "Download file from URL",
    "Sync files between directories",
    "Watch file for changes",
    "Compare two files",
    "Merge file contents",
    "Split large file",
    "Convert file format",
    "Validate file syntax",
    "Count lines in file",
    "Find and replace in file",
    "Sort file contents",
    "Filter file lines",
    "Deduplicate file entries",
    "Encrypt file",
    "Decrypt file",
    "Hash file contents",
    "Sign file digitally",
    "Verify file signature",
    "Backup important files",
    "Restore from backup",
    "Clean up temporary files",
    "Organize files by type",
    "Archive old files",
    "Monitor file system",
    "Check disk space",
    "Optimize file storage",
    "Index files for search",
    "Tag files with metadata",
    "Preview file contents",
    "Generate file report",
    "Audit file access",
    "Lock file for editing",
    "Unlock file",
    "Version control file",
    "Diff file versions",
    "Rollback file changes",
    "Browse file history",
    "Search file content",
    "Grep pattern in files",
    "Find files by date",
    "Find large files",
    "Find duplicate files",
    "Clean up duplicates",
    "Optimize images",
    "Resize images",
    "Convert image format",
    "Generate thumbnails",
    "Extract text from PDF",
    "Merge PDF files",
    "Split PDF pages",
    "Convert document to PDF",
    "Extract images from document",
    "Parse configuration file",
    "Validate JSON file",
    "Format code file",
    
    # === DATA PROCESSING (data_processing) - 80 queries ===
    "Analyze this data",
    "Parse JSON data",
    "Extract data from CSV",
    "Transform data format",
    "Clean messy data",
    "Validate data quality",
    "Filter data by criteria",
    "Sort data by column",
    "Group data by category",
    "Aggregate data statistics",
    "Join two datasets",
    "Merge data tables",
    "Pivot data table",
    "Unpivot data",
    "Reshape data structure",
    "Normalize data values",
    "Denormalize data",
    "Encode categorical data",
    "Decode data values",
    "Compress data",
    "Decompress data",
    "Serialize data",
    "Deserialize data",
    "Convert data format",
    "Export data to Excel",
    "Import data from database",
    "Query database",
    "Update database records",
    "Delete database entries",
    "Backup database",
    "Restore database",
    "Migrate database schema",
    "Index database tables",
    "Optimize database queries",
    "Analyze query performance",
    "Generate data report",
    "Visualize data trends",
    "Create data dashboard",
    "Plot data chart",
    "Generate statistics",
    "Calculate metrics",
    "Compute averages",
    "Find outliers",
    "Detect anomalies",
    "Identify patterns",
    "Cluster data points",
    "Classify data",
    "Predict values",
    "Forecast trends",
    "Analyze time series",
    "Smooth data",
    "Interpolate missing values",
    "Impute missing data",
    "Handle null values",
    "Remove duplicates",
    "Deduplicate records",
    "Validate data schema",
    "Check data integrity",
    "Audit data changes",
    "Track data lineage",
    "Version data",
    "Snapshot data state",
    "Compare data versions",
    "Diff data changes",
    "Sync data sources",
    "Replicate data",
    "Partition data",
    "Shard data",
    "Sample data",
    "Stratify sample",
    "Bootstrap data",
    "Cross-validate data",
    "Split train/test data",
    "Balance dataset",
    "Augment data",
    "Generate synthetic data",
    "Anonymize sensitive data",
    "Mask PII data",
    "Encrypt data",
    "Decrypt data",
    
    # === WORKFLOW & TASKS (workflow) - 80 queries ===
    "Help me organize my tasks",
    "Create a project plan",
    "Set up workflow",
    "Define process steps",
    "Schedule tasks",
    "Prioritize work items",
    "Track progress",
    "Monitor milestones",
    "Update task status",
    "Complete task",
    "Mark as done",
    "Assign task to team",
    "Delegate work",
    "Review task list",
    "Check deadlines",
    "Send reminders",
    "Notify stakeholders",
    "Generate status report",
    "Create timeline",
    "Build roadmap",
    "Plan sprint",
    "Organize backlog",
    "Estimate effort",
    "Calculate velocity",
    "Track burndown",
    "Measure productivity",
    "Analyze bottlenecks",
    "Optimize workflow",
    "Automate process",
    "Set up pipeline",
    "Configure CI/CD",
    "Deploy application",
    "Release version",
    "Rollback deployment",
    "Monitor deployment",
    "Check health status",
    "Run diagnostics",
    "Troubleshoot issues",
    "Debug problems",
    "Fix bugs",
    "Apply patches",
    "Update dependencies",
    "Upgrade packages",
    "Install software",
    "Configure settings",
    "Initialize project",
    "Bootstrap application",
    "Scaffold code",
    "Generate boilerplate",
    "Set up environment",
    "Configure development",
    "Prepare staging",
    "Setup production",
    "Provision infrastructure",
    "Allocate resources",
    "Scale services",
    "Load balance",
    "Cache data",
    "Optimize performance",
    "Reduce latency",
    "Improve throughput",
    "Monitor metrics",
    "Set up alerts",
    "Configure logging",
    "Aggregate logs",
    "Analyze logs",
    "Trace requests",
    "Profile code",
    "Benchmark performance",
    "Load test",
    "Stress test",
    "Security scan",
    "Vulnerability check",
    "Penetration test",
    "Audit security",
    "Review permissions",
    "Manage access",
    "Rotate credentials",
    "Update secrets",
    "Backup configuration",
    "Restore settings",
    
    # === CONTENT CREATION (content_creation) - 80 queries ===
    "Write a blog post",
    "Create article",
    "Draft document",
    "Compose email",
    "Write report",
    "Generate summary",
    "Create presentation",
    "Design slides",
    "Write README",
    "Document API",
    "Create tutorial",
    "Write guide",
    "Draft proposal",
    "Compose letter",
    "Write essay",
    "Create story",
    "Draft script",
    "Write copy",
    "Create ad content",
    "Write product description",
    "Generate marketing content",
    "Create social media post",
    "Write tweet",
    "Draft LinkedIn post",
    "Create Instagram caption",
    "Write Facebook update",
    "Generate blog title",
    "Create headline",
    "Write meta description",
    "Generate keywords",
    "Create SEO content",
    "Write press release",
    "Draft announcement",
    "Create newsletter",
    "Write email campaign",
    "Generate subject lines",
    "Create call-to-action",
    "Write landing page",
    "Create website copy",
    "Draft terms of service",
    "Write privacy policy",
    "Create FAQ",
    "Write help documentation",
    "Generate user manual",
    "Create training materials",
    "Write course content",
    "Draft lesson plan",
    "Create quiz questions",
    "Write test cases",
    "Generate examples",
    "Create code comments",
    "Write docstrings",
    "Document functions",
    "Create changelog",
    "Write release notes",
    "Draft migration guide",
    "Create troubleshooting guide",
    "Write error messages",
    "Generate tooltips",
    "Create UI text",
    "Write button labels",
    "Draft form labels",
    "Create placeholder text",
    "Write validation messages",
    "Generate success messages",
    "Create notification text",
    "Write alert messages",
    "Draft confirmation dialogs",
    "Create onboarding content",
    "Write welcome message",
    "Generate tips",
    "Create hints",
    "Write suggestions",
    "Draft recommendations",
    "Create reviews",
    "Write testimonials",
    "Generate quotes",
    "Create captions",
    "Write alt text",
    "Draft image descriptions",
    "Create video scripts",
    "Write podcast notes",
    
    # === MIXED/AMBIGUOUS (multiple modules) - 64 queries ===
    "Help me with my project",
    "What can you do?",
    "Show me examples",
    "Explain this concept",
    "How do I start?",
    "Give me suggestions",
    "What's the best approach?",
    "Help me decide",
    "Compare options",
    "Analyze pros and cons",
    "Review my work",
    "Check for errors",
    "Improve this",
    "Optimize performance",
    "Make it better",
    "Fix issues",
    "Solve problem",
    "Find solution",
    "Debug code",
    "Test functionality",
    "Validate results",
    "Verify correctness",
    "Ensure quality",
    "Meet requirements",
    "Follow best practices",
    "Apply standards",
    "Maintain consistency",
    "Keep organized",
    "Stay on track",
    "Meet deadline",
    "Deliver on time",
    "Complete project",
    "Finish task",
    "Wrap up work",
    "Prepare for launch",
    "Get ready to deploy",
    "Set up for production",
    "Go live",
    "Release to users",
    "Announce launch",
    "Promote product",
    "Market service",
    "Reach audience",
    "Engage users",
    "Build community",
    "Grow platform",
    "Scale business",
    "Increase revenue",
    "Reduce costs",
    "Improve efficiency",
    "Boost productivity",
    "Enhance quality",
    "Deliver value",
    "Satisfy customers",
    "Meet expectations",
    "Exceed goals",
    "Achieve success",
    "Measure impact",
    "Track ROI",
    "Analyze results",
    "Report findings",
    "Share insights",
    "Communicate updates",
    "Collaborate with team",
    "Coordinate efforts",
]

def run_large_scale_test():
    """Run large-scale routing comparison."""
    
    print("=" * 80)
    print("LARGE-SCALE ROUTING TEST: 384+ Queries")
    print("=" * 80)
    print()
    
    # Initialize routers
    keyword_router = get_router()
    semantic_router = get_semantic_router()
    
    # Track results
    keyword_results = []
    semantic_results = []
    
    total_queries = len(TEST_QUERIES)
    print(f"Testing {total_queries} queries...")
    print()
    
    # Test each query
    for i, query in enumerate(TEST_QUERIES, 1):
        # Keyword routing
        keyword_modules = keyword_router.route(query)
        keyword_tool_modules = [m for m in keyword_modules if m.value.startswith("tools/")]
        keyword_count = len(keyword_modules)
        keyword_reduction = (8 - keyword_count) / 8 * 100
        
        # Semantic routing
        semantic_modules = semantic_router.route(query, threshold=0.3, use_hybrid=False)
        semantic_tool_modules = [m for m in semantic_modules if m.value.startswith("tools/")]
        semantic_count = len(semantic_modules)
        semantic_reduction = (8 - semantic_count) / 8 * 100
        
        # Store results
        keyword_results.append({
            'query': query,
            'modules': keyword_count,
            'tool_modules': len(keyword_tool_modules),
            'reduction': keyword_reduction
        })
        
        semantic_results.append({
            'query': query,
            'modules': semantic_count,
            'tool_modules': len(semantic_tool_modules),
            'reduction': semantic_reduction
        })
        
        # Progress indicator
        if i % 50 == 0:
            print(f"Progress: {i}/{total_queries} queries tested...")
    
    print()
    print("=" * 80)
    print("RESULTS")
    print("=" * 80)
    print()
    
    # Calculate statistics
    keyword_avg_modules = sum(r['modules'] for r in keyword_results) / len(keyword_results)
    semantic_avg_modules = sum(r['modules'] for r in semantic_results) / len(semantic_results)
    
    keyword_avg_reduction = sum(r['reduction'] for r in keyword_results) / len(keyword_results)
    semantic_avg_reduction = sum(r['reduction'] for r in semantic_results) / len(semantic_results)
    
    # Calculate variance
    keyword_variance = sum((r['reduction'] - keyword_avg_reduction) ** 2 for r in keyword_results) / len(keyword_results)
    semantic_variance = sum((r['reduction'] - semantic_avg_reduction) ** 2 for r in semantic_results) / len(semantic_results)
    
    keyword_std_dev = keyword_variance ** 0.5
    semantic_std_dev = semantic_variance ** 0.5
    
    print(f"📊 Sample Size: {total_queries} queries")
    print(f"   Required for 95% confidence: 384 queries")
    print(f"   Status: {'✅ SUFFICIENT' if total_queries >= 384 else '⚠️ INSUFFICIENT'}")
    print()
    
    print(f"📦 Average Modules Loaded:")
    print(f"   Keyword:  {keyword_avg_modules:.2f} modules")
    print(f"   Semantic: {semantic_avg_modules:.2f} modules")
    print(f"   Difference: {semantic_avg_modules - keyword_avg_modules:+.2f} modules")
    print()
    
    print(f"💰 Average Cost Reduction:")
    print(f"   Keyword:  {keyword_avg_reduction:.1f}%")
    print(f"   Semantic: {semantic_avg_reduction:.1f}%")
    print(f"   Difference: {semantic_avg_reduction - keyword_avg_reduction:+.1f}%")
    print()
    
    print(f"📈 Standard Deviation:")
    print(f"   Keyword:  {keyword_std_dev:.1f}%")
    print(f"   Semantic: {semantic_std_dev:.1f}%")
    print()
    
    # Statistical significance test (t-test)
    import math
    
    # Calculate t-statistic
    mean_diff = semantic_avg_reduction - keyword_avg_reduction
    pooled_std = math.sqrt((keyword_variance + semantic_variance) / 2)
    t_stat = mean_diff / (pooled_std * math.sqrt(2 / total_queries))
    
    # Degrees of freedom
    df = 2 * total_queries - 2
    
    # Critical value for 95% confidence (two-tailed)
    # For large df, approximately 1.96
    critical_value = 1.96
    
    is_significant = abs(t_stat) > critical_value
    
    print(f"📊 Statistical Significance:")
    print(f"   t-statistic: {t_stat:.3f}")
    print(f"   Critical value (95%): ±{critical_value}")
    print(f"   Result: {'✅ SIGNIFICANT' if is_significant else '❌ NOT SIGNIFICANT'}")
    print()
    
    # Conclusion
    print("=" * 80)
    print("CONCLUSION")
    print("=" * 80)
    print()
    
    if semantic_avg_reduction > keyword_avg_reduction:
        if is_significant:
            print(f"✅ Semantic routing is SIGNIFICANTLY BETTER by {semantic_avg_reduction - keyword_avg_reduction:.1f}%")
            print(f"   Recommendation: DEPLOY SEMANTIC ROUTING")
        else:
            print(f"⚠️ Semantic routing is slightly better by {semantic_avg_reduction - keyword_avg_reduction:.1f}%")
            print(f"   But difference is NOT statistically significant")
            print(f"   Recommendation: KEEP KEYWORD ROUTING (simpler)")
    else:
        if is_significant:
            print(f"❌ Semantic routing is SIGNIFICANTLY WORSE by {keyword_avg_reduction - semantic_avg_reduction:.1f}%")
            print(f"   Recommendation: KEEP KEYWORD ROUTING")
        else:
            print(f"⚠️ Semantic routing is slightly worse by {keyword_avg_reduction - semantic_avg_reduction:.1f}%")
            print(f"   But difference is NOT statistically significant")
            print(f"   Recommendation: KEEP KEYWORD ROUTING (simpler)")
    
    print()
    print("=" * 80)

if __name__ == "__main__":
    run_large_scale_test()

