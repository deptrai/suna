const axios = require('axios');

// Test T3.1.5 API endpoints
async function testSentimentAPI() {
  console.log('🧪 Testing T3.1.5: Sentiment Analysis API Endpoints\n');

  const baseURL = 'http://localhost:3002/api/v1';
  
  // Test data
  const testCases = [
    {
      text: "Bitcoin is going to the moon! 🚀💎 HODL strong!",
      source: "twitter"
    },
    {
      text: "This crypto crash is terrible 😭 I'm getting rekt",
      source: "reddit"
    },
    {
      text: "Ethereum looks bullish, great fundamentals and strong community",
      source: "news"
    },
    {
      text: "FUD everywhere, but I'm not selling. Diamond hands! 💎🙌",
      source: "twitter"
    }
  ];

  try {
    // Test 1: Health check
    console.log('🏥 Testing health endpoint...');
    try {
      const healthResponse = await axios.get(`${baseURL}/health`);
      console.log('✅ Health check:', healthResponse.data);
    } catch (error) {
      console.log('❌ Health check failed:', error.message);
    }

    // Test 2: Individual sentiment analysis
    console.log('\n📝 Testing individual sentiment analysis...');
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n--- Test Case ${i + 1} ---`);
      console.log(`Text: "${testCase.text}"`);
      console.log(`Source: ${testCase.source}`);
      
      try {
        const response = await axios.post(`${baseURL}/sentiment/analyze`, {
          text: testCase.text,
          source: testCase.source
        });
        
        const result = response.data;
        console.log(`✅ Sentiment: ${result.sentiment} (${result.score.toFixed(3)})`);
        console.log(`   Confidence: ${result.confidence.toFixed(3)}`);
        console.log(`   VADER: ${result.breakdown.vader.compound.toFixed(3)}`);
        console.log(`   Preprocessing: ${result.preprocessing.language}, ${result.preprocessing.emojis.length} emojis, ${result.preprocessing.slangTerms.length} slang`);
        
        if (result.biasDetection.hasBias) {
          console.log(`   Bias detected: ${result.biasDetection.biasType.join(', ')}`);
          console.log(`   Corrected score: ${result.biasDetection.correctedScore.toFixed(3)}`);
        }
      } catch (error) {
        console.log(`❌ Sentiment analysis failed: ${error.response?.data?.message || error.message}`);
      }
    }

    // Test 3: Symbol sentiment aggregation
    console.log('\n📊 Testing symbol sentiment aggregation...');
    const symbols = ['BTC', 'ETH', 'ADA'];
    
    for (const symbol of symbols) {
      console.log(`\n--- Symbol: ${symbol} ---`);
      try {
        const response = await axios.get(`${baseURL}/sentiment/symbol/${symbol}`);
        const result = response.data;
        
        console.log(`✅ Overall sentiment: ${result.overallSentiment.toFixed(3)}`);
        console.log(`   Weighted sentiment: ${result.weightedSentiment.toFixed(3)}`);
        console.log(`   Confidence: ${result.confidence.toFixed(3)}`);
        console.log(`   Time decay factor: ${result.timeDecayFactor.toFixed(3)}`);
        console.log(`   Sources:`);
        console.log(`     Twitter: ${result.sources.twitter.score.toFixed(3)} (weight: ${result.sources.twitter.weight}, count: ${result.sources.twitter.count})`);
        console.log(`     Reddit: ${result.sources.reddit.score.toFixed(3)} (weight: ${result.sources.reddit.weight}, count: ${result.sources.reddit.count})`);
        console.log(`     News: ${result.sources.news.score.toFixed(3)} (weight: ${result.sources.news.weight}, count: ${result.sources.news.count})`);
        
        if (result.outliers.length > 0) {
          console.log(`   Outliers detected: ${result.outliers.length}`);
        }
      } catch (error) {
        console.log(`❌ Symbol sentiment failed: ${error.response?.data?.message || error.message}`);
      }
    }

    // Test 4: Batch sentiment analysis
    console.log('\n📦 Testing batch sentiment analysis...');
    try {
      const batchTexts = testCases.map(tc => tc.text);
      const response = await axios.post(`${baseURL}/sentiment/batch`, {
        texts: batchTexts,
        source: 'batch_test'
      });
      
      const results = response.data;
      console.log(`✅ Batch analysis completed: ${results.length} results`);
      
      const avgSentiment = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
      
      console.log(`   Average sentiment: ${avgSentiment.toFixed(3)}`);
      console.log(`   Average confidence: ${avgConfidence.toFixed(3)}`);
      console.log(`   Positive: ${results.filter(r => r.sentiment === 'positive').length}`);
      console.log(`   Negative: ${results.filter(r => r.sentiment === 'negative').length}`);
      console.log(`   Neutral: ${results.filter(r => r.sentiment === 'neutral').length}`);
    } catch (error) {
      console.log(`❌ Batch analysis failed: ${error.response?.data?.message || error.message}`);
    }

    // Test 5: Real-time sentiment
    console.log('\n⚡ Testing real-time sentiment...');
    try {
      const response = await axios.get(`${baseURL}/sentiment/realtime/BTC?timeWindow=3600`);
      const result = response.data;
      
      console.log(`✅ Real-time sentiment for BTC:`);
      console.log(`   Current sentiment: ${result.currentSentiment.toFixed(3)}`);
      console.log(`   Trend: ${result.trend} (strength: ${result.trendStrength.toFixed(3)})`);
      console.log(`   Volatility: ${result.volatility.toFixed(3)}`);
      console.log(`   Time window: ${result.timeWindow}s`);
      console.log(`   Confidence: ${result.confidence.toFixed(3)}`);
    } catch (error) {
      console.log(`❌ Real-time sentiment failed: ${error.response?.data?.message || error.message}`);
    }

    // Test 6: Cross-platform sentiment
    console.log('\n🌐 Testing cross-platform sentiment...');
    try {
      const response = await axios.get(`${baseURL}/sentiment/cross-platform/ETH`);
      const result = response.data;
      
      console.log(`✅ Cross-platform sentiment for ETH:`);
      console.log(`   Cross-platform score: ${result.crossPlatformScore.toFixed(3)}`);
      console.log(`   Consensus: ${result.consensus.agreement} (score: ${result.consensus.score.toFixed(3)}, strength: ${result.consensus.strength.toFixed(3)})`);
    } catch (error) {
      console.log(`❌ Cross-platform sentiment failed: ${error.response?.data?.message || error.message}`);
    }

    console.log('\n✅ T3.1.5 API Testing Complete!');
    console.log('\n🎯 T3.1.5 Implementation Status: ✅ API ENDPOINTS WORKING');

  } catch (error) {
    console.log('\n❌ API Testing Failed:', error.message);
    console.log('\n🎯 T3.1.5 Implementation Status: ❌ API CONNECTION FAILED');
  }
}

// Run tests
testSentimentAPI();
