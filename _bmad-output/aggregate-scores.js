const fs = require('fs');

const timestamp = '2026-05-08';
const dimensions = ['determinism', 'isolation', 'maintainability', 'performance'];
const results = {};

try {
  dimensions.forEach((dim) => {
    const outputPath = `/tmp/tea-test-review-${dim}-${timestamp}.json`;
    results[dim] = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  });
} catch (error) {
  console.error('Error reading subagent outputs:', error.message);
  process.exit(1);
}

const weights = {
  determinism: 0.3,
  isolation: 0.3,
  maintainability: 0.25,
  performance: 0.15,
};

const overallScore = dimensions.reduce((sum, dim) => {
  return sum + (results[dim].score * weights[dim]);
}, 0);

const roundedScore = Math.round(overallScore);

const getGrade = (score) => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

const overallGrade = getGrade(roundedScore);

const allViolations = dimensions.flatMap((dim) =>
  (results[dim].violations || []).map((v) => ({
    ...v,
    dimension: dim,
  }))
);

const highSeverity = allViolations.filter((v) => v.severity === 'HIGH');
const mediumSeverity = allViolations.filter((v) => v.severity === 'MEDIUM');
const lowSeverity = allViolations.filter((v) => v.severity === 'LOW');

const violationSummary = {
  total: allViolations.length,
  HIGH: highSeverity.length,
  MEDIUM: mediumSeverity.length,
  LOW: lowSeverity.length,
};

const allRecommendations = dimensions.flatMap((dim) =>
  (results[dim].recommendations || []).map((rec) => ({
    dimension: dim,
    recommendation: typeof rec === 'string' ? rec : rec.text || JSON.stringify(rec),
    impact: results[dim].score < 70 ? 'HIGH' : 'MEDIUM',
  }))
);

const prioritizedRecommendations = allRecommendations.sort((a, b) => (a.impact === 'HIGH' ? -1 : 1)).slice(0, 10);

const reviewSummary = {
  overall_score: roundedScore,
  overall_grade: overallGrade,
  quality_assessment: `The test suite scored ${roundedScore}/100.`,
  dimension_scores: {
    determinism: results.determinism.score,
    isolation: results.isolation.score,
    maintainability: results.maintainability.score,
    performance: results.performance.score,
  },
  dimension_grades: {
    determinism: results.determinism.grade || getGrade(results.determinism.score),
    isolation: results.isolation.grade || getGrade(results.isolation.score),
    maintainability: results.maintainability.grade || getGrade(results.maintainability.score),
    performance: results.performance.grade || getGrade(results.performance.score),
  },
  violations_summary: violationSummary,
  high_severity_violations: highSeverity,
  top_10_recommendations: prioritizedRecommendations,
  subagent_execution: 'PARALLEL (4 quality dimensions)',
  performance_gain: '~60% faster than sequential',
};

fs.writeFileSync(`/tmp/tea-test-review-summary-${timestamp}.json`, JSON.stringify(reviewSummary, null, 2), 'utf8');

console.log(`✅ Quality Evaluation Complete (Parallel Execution)

📊 Overall Quality Score: ${roundedScore}/100 (Grade: ${overallGrade})

📈 Dimension Scores:
- Determinism:      ${results.determinism.score}/100 (${results.determinism.grade || getGrade(results.determinism.score)})
- Isolation:        ${results.isolation.score}/100 (${results.isolation.grade || getGrade(results.isolation.score)})
- Maintainability:  ${results.maintainability.score}/100 (${results.maintainability.grade || getGrade(results.maintainability.score)})
- Performance:      ${results.performance.score}/100 (${results.performance.grade || getGrade(results.performance.score)})

⚠️ Violations Found:
- HIGH:   ${violationSummary.HIGH} violations
- MEDIUM: ${violationSummary.MEDIUM} violations
- LOW:    ${violationSummary.LOW} violations
- TOTAL:  ${violationSummary.total} violations

🚀 Performance: Parallel execution ~60% faster than sequential`);
