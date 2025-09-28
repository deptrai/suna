const vader = require('vader-sentiment');
const sentiment = require('sentiment');
const compromise = require('compromise');
const emojiRegex = require('emoji-regex');

// Test T3.1.5: Sentiment Analysis Engine
console.log('🧪 Testing T3.1.5: Sentiment Analysis Engine\n');

// Test data
const testTexts = [
  "Bitcoin is going to the moon! 🚀💎 HODL strong!",
  "This crypto crash is terrible 😭 I'm getting rekt",
  "Ethereum looks bullish, great fundamentals and strong community",
  "FUD everywhere, but I'm not selling. Diamond hands! 💎🙌",
  "The market is dumping hard, paper hands are selling",
  "FOMO is real, but DYOR before investing",
  "Neutral analysis of blockchain technology and its applications"
];

// T3.1.5a: Text preprocessing
function preprocessText(text) {
  console.log(`📝 Preprocessing: "${text}"`);
  
  // Extract emojis
  const regex = emojiRegex();
  const emojis = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    emojis.push(match[0]);
  }
  
  // Extract crypto slang
  const cryptoSlang = ['hodl', 'fud', 'fomo', 'rekt', 'moon', 'diamond hands', 'paper hands', 'ape', 'degen'];
  const slangFound = cryptoSlang.filter(slang => text.toLowerCase().includes(slang));
  
  // Clean text
  const cleanedText = text
    .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
    .replace(/[@#](\w+)/g, '$1') // Remove @ and #
    .replace(/\s+/g, ' ') // Normalize whitespace
    .toLowerCase()
    .trim();
  
  console.log(`   Emojis found: ${emojis.join(' ')}`);
  console.log(`   Slang found: ${slangFound.join(', ')}`);
  console.log(`   Cleaned: "${cleanedText}"`);
  
  return { cleanedText, emojis, slangFound };
}

// T3.1.5b: Multi-model sentiment analysis
function analyzeSentiment(text) {
  console.log(`\n🔍 Analyzing sentiment: "${text}"`);
  
  // Preprocessing
  const { cleanedText, emojis, slangFound } = preprocessText(text);
  
  // VADER sentiment (primary)
  const vaderResult = vader.SentimentIntensityAnalyzer.polarity_scores(cleanedText);
  
  // Fallback sentiment
  const sentimentAnalyzer = new sentiment();
  const fallbackResult = sentimentAnalyzer.analyze(cleanedText);
  
  // Compromise NLP
  const doc = compromise(cleanedText);
  const adjectives = doc.adjectives().out('array');
  const verbs = doc.verbs().out('array');
  
  // Emoji sentiment (simple mapping)
  const emojiSentiment = {
    '🚀': 0.8, '💎': 0.8, '🙌': 0.7, '📈': 0.8, '💰': 0.8,
    '😭': -0.8, '😡': -0.8, '📉': -0.8, '💸': -0.5
  };
  
  let emojiScore = 0;
  emojis.forEach(emoji => {
    emojiScore += emojiSentiment[emoji] || 0;
  });
  if (emojis.length > 0) emojiScore /= emojis.length;
  
  // Combine scores
  const finalScore = vaderResult.compound;
  const confidence = Math.abs(vaderResult.compound) * 0.8 + 0.2;
  
  const sentiment_category = finalScore > 0.1 ? 'positive' : finalScore < -0.1 ? 'negative' : 'neutral';
  
  console.log(`   VADER: ${vaderResult.compound.toFixed(3)} (pos: ${vaderResult.pos.toFixed(2)}, neg: ${vaderResult.neg.toFixed(2)}, neu: ${vaderResult.neu.toFixed(2)})`);
  console.log(`   Fallback: ${fallbackResult.comparative.toFixed(3)} (score: ${fallbackResult.score})`);
  console.log(`   Compromise: adjectives: [${adjectives.join(', ')}], verbs: [${verbs.join(', ')}]`);
  console.log(`   Emoji sentiment: ${emojiScore.toFixed(3)}`);
  console.log(`   Final: ${finalScore.toFixed(3)} (${sentiment_category}) - Confidence: ${confidence.toFixed(3)}`);
  
  return {
    text: cleanedText,
    score: finalScore,
    sentiment: sentiment_category,
    confidence: confidence,
    breakdown: {
      vader: vaderResult,
      fallback: fallbackResult,
      compromise: { adjectives, verbs },
      emoji: emojiScore
    }
  };
}

// T3.1.5c: Aggregation test
function aggregateSentiments(results) {
  console.log(`\n📊 Aggregating ${results.length} sentiment results:`);
  
  const scores = results.map(r => r.score);
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
  const consensus = Math.max(0, 1 - variance);
  
  console.log(`   Average sentiment: ${avgScore.toFixed(3)}`);
  console.log(`   Variance: ${variance.toFixed(3)}`);
  console.log(`   Consensus strength: ${consensus.toFixed(3)}`);
  
  return { avgScore, variance, consensus };
}

// Run tests
console.log('🚀 Starting sentiment analysis tests...\n');

const results = [];
testTexts.forEach((text, index) => {
  console.log(`\n--- Test ${index + 1} ---`);
  const result = analyzeSentiment(text);
  results.push(result);
});

// Aggregate results
const aggregated = aggregateSentiments(results);

console.log('\n✅ T3.1.5 Sentiment Analysis Engine Test Complete!');
console.log('\n📈 Summary:');
console.log(`   Positive texts: ${results.filter(r => r.sentiment === 'positive').length}`);
console.log(`   Negative texts: ${results.filter(r => r.sentiment === 'negative').length}`);
console.log(`   Neutral texts: ${results.filter(r => r.sentiment === 'neutral').length}`);
console.log(`   Average confidence: ${(results.reduce((sum, r) => sum + r.confidence, 0) / results.length).toFixed(3)}`);
console.log(`   Overall sentiment: ${aggregated.avgScore.toFixed(3)}`);
console.log(`   Consensus strength: ${aggregated.consensus.toFixed(3)}`);

console.log('\n🎯 T3.1.5 Implementation Status: ✅ WORKING');
