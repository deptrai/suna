# Sentiment Analysis Service API Documentation

## Overview

The Sentiment Analysis Service provides comprehensive sentiment analysis capabilities for cryptocurrency-related content across multiple platforms (Twitter, Reddit, News). It features multi-model sentiment analysis, bias detection, and real-time aggregation.

**Base URL:** `http://localhost:3002/api/v1`  
**Version:** 1.0.0  
**Service:** Sentiment Analysis Service  

## Authentication

Currently, the service operates without authentication for development. In production, API keys will be required.

## Rate Limiting

- **Individual Analysis:** 100 requests/minute
- **Batch Analysis:** 10 requests/minute  
- **Symbol Aggregation:** 50 requests/minute

## Core Endpoints

### 1. Health Check

**GET** `/health`

Returns the health status of the sentiment analysis service.

**Response:**
```json
{
  "status": "ok",
  "info": {
    "sentiment": {
      "status": "up",
      "initialized": true,
      "slangTermsLoaded": 20,
      "emojiMappingsLoaded": 50
    },
    "cache": { "status": "up" },
    "database": { "status": "up" }
  }
}
```

### 2. Individual Sentiment Analysis

**POST** `/sentiment/analyze`

Analyzes sentiment of a single text using multi-model approach with bias detection.

**Request Body:**
```json
{
  "text": "Bitcoin is going to the moon! 🚀💎 HODL strong!",
  "source": "twitter"
}
```

**Parameters:**
- `text` (string, required): Text to analyze (max 10,000 characters)
- `source` (string, optional): Source platform ("twitter", "reddit", "news", "manual")

**Response:**
```json
{
  "text": "bitcoin is going to the moon! 🚀💎 hodl strong!",
  "originalText": "Bitcoin is going to the moon! 🚀💎 HODL strong!",
  "source": "twitter",
  "score": 0.597,
  "sentiment": "positive",
  "confidence": 0.678,
  "breakdown": {
    "vader": {
      "positive": 0.33,
      "negative": 0.00,
      "neutral": 0.67,
      "compound": 0.597
    },
    "fallback": {
      "score": 2,
      "comparative": 0.222,
      "tokens": 9
    },
    "compromise": {
      "score": 0.4,
      "adjectives": ["strong"],
      "verbs": ["is", "going"],
      "wordCount": 2
    },
    "emoji": {
      "score": 0.8,
      "count": 2,
      "breakdown": [
        { "emoji": "🚀", "score": 0.8 },
        { "emoji": "💎", "score": 0.8 }
      ]
    }
  },
  "preprocessing": {
    "originalText": "Bitcoin is going to the moon! 🚀💎 HODL strong!",
    "cleanedText": "bitcoin is going to the moon! 🚀💎 hodl strong!",
    "normalizedText": "Bitcoin is going to the moon! 🚀💎 hold strong!",
    "language": "en",
    "emojis": ["🚀", "💎"],
    "slangTerms": ["hodl", "moon"],
    "tokens": ["bitcoin", "is", "going", "to", "the", "moon", "hodl", "strong"],
    "entities": [],
    "confidence": 0.8
  },
  "biasDetection": {
    "hasBias": true,
    "biasType": ["source_social_media", "emoji"],
    "correctedScore": 0.567
  },
  "timestamp": "2025-09-28T12:30:00.000Z"
}
```

### 3. Batch Sentiment Analysis

**POST** `/sentiment/batch`

Analyzes sentiment for multiple texts in a single request.

**Request Body:**
```json
{
  "texts": [
    "Bitcoin is great! 🚀",
    "Crypto crash is bad 😭",
    "Neutral blockchain analysis"
  ],
  "source": "batch_test"
}
```

**Parameters:**
- `texts` (array, required): Array of texts to analyze (max 50 texts)
- `source` (string, optional): Source platform

**Response:**
```json
[
  {
    "text": "bitcoin is great! 🚀",
    "score": 0.6,
    "sentiment": "positive",
    "confidence": 0.7,
    // ... full sentiment analysis result
  },
  // ... additional results
]
```

### 4. Symbol Sentiment Aggregation

**GET** `/sentiment/symbol/{symbol}`

Gets aggregated sentiment for a cryptocurrency symbol from all sources.

**Parameters:**
- `symbol` (string, required): Cryptocurrency symbol (e.g., "BTC", "ETH", "ADA")

**Response:**
```json
{
  "symbol": "BTC",
  "overallSentiment": 0.234,
  "weightedSentiment": 0.198,
  "sources": {
    "twitter": {
      "score": 0.3,
      "weight": 0.3,
      "count": 150
    },
    "reddit": {
      "score": 0.2,
      "weight": 0.4,
      "count": 75
    },
    "news": {
      "score": 0.1,
      "weight": 0.3,
      "count": 25
    }
  },
  "confidence": 0.75,
  "timeDecayFactor": 0.85,
  "outliers": [
    {
      "source": "twitter",
      "score": 0.9,
      "zScore": 2.3,
      "deviation": 0.6
    }
  ],
  "lastUpdated": "2025-09-28T12:30:00.000Z"
}
```

### 5. Real-time Sentiment

**GET** `/sentiment/realtime/{symbol}`

Gets real-time sentiment with trend analysis for a symbol.

**Parameters:**
- `symbol` (string, required): Cryptocurrency symbol
- `timeWindow` (number, optional): Time window in seconds (default: 3600)

**Response:**
```json
{
  "symbol": "BTC",
  "currentSentiment": 0.234,
  "trend": "bullish",
  "trendStrength": 0.6,
  "volatility": 0.3,
  "timeWindow": 3600,
  "sources": {
    "twitter": { "score": 0.3, "weight": 0.3, "count": 150 },
    "reddit": { "score": 0.2, "weight": 0.4, "count": 75 },
    "news": { "score": 0.1, "weight": 0.3, "count": 25 }
  },
  "confidence": 0.75,
  "lastUpdated": "2025-09-28T12:30:00.000Z"
}
```

### 6. Cross-platform Sentiment

**GET** `/sentiment/cross-platform/{symbol}`

Gets cross-platform sentiment analysis with consensus calculation.

**Parameters:**
- `symbol` (string, required): Cryptocurrency symbol

**Response:**
```json
{
  "symbol": "ETH",
  "aggregated": {
    // ... aggregated sentiment data
  },
  "realtime": {
    // ... real-time sentiment data
  },
  "crossPlatformScore": 0.267,
  "consensus": {
    "score": 0.245,
    "strength": 0.78,
    "agreement": "high"
  },
  "lastUpdated": "2025-09-28T12:30:00.000Z"
}
```

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "text",
      "message": "Text is required"
    }
  ]
}
```

### 429 Too Many Requests
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded",
  "error": "Too Many Requests",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error",
  "timestamp": "2025-09-28T12:30:00.000Z"
}
```

## Sentiment Analysis Features

### Multi-model Analysis
- **VADER Sentiment**: Primary model for compound sentiment scoring
- **Sentiment Library**: Fallback model for comparative analysis
- **Compromise NLP**: Linguistic analysis for adjectives and verbs
- **Emoji Analysis**: Dedicated emoji sentiment scoring

### Crypto-specific Features
- **Slang Dictionary**: 20+ crypto terms (hodl, fud, fomo, rekt, moon, etc.)
- **Emoji Sentiment**: 50+ emoji mappings with sentiment scores
- **Market Terminology**: Specialized crypto market sentiment indicators

### Bias Detection & Correction
- **Source Bias**: Social media vs news bias adjustment
- **Length Bias**: Short/long text bias correction
- **Emoji Bias**: Emoji-heavy content bias adjustment
- **Slang Bias**: Informal content bias correction

### Aggregation & Weighting
- **Source Weighting**: Dynamic weighting based on source credibility
- **Time Decay**: Time-based sentiment relevance calculation
- **Outlier Detection**: Statistical outlier identification using z-scores
- **Consensus Calculation**: Cross-platform sentiment agreement

## Caching

- **Individual Analysis**: 10-minute cache
- **Aggregated Sentiment**: 30-minute cache
- **Real-time Data**: 5-minute cache
- **Cross-platform**: 15-minute cache

## Monitoring & Metrics

The service provides comprehensive metrics via Prometheus:

- `sentiment_analysis_total`: Total sentiment analyses performed
- `sentiment_analysis_duration`: Analysis duration histogram
- `sentiment_cache_hits_total`: Cache hit counter
- `sentiment_api_requests_total`: API request counter
- `sentiment_errors_total`: Error counter

## SDKs and Examples

### JavaScript/Node.js Example
```javascript
const axios = require('axios');

// Analyze sentiment
const response = await axios.post('http://localhost:3002/api/v1/sentiment/analyze', {
  text: 'Bitcoin is going to the moon! 🚀',
  source: 'twitter'
});

console.log(response.data.sentiment); // 'positive'
console.log(response.data.score); // 0.597
```

### Python Example
```python
import requests

# Get symbol sentiment
response = requests.get('http://localhost:3002/api/v1/sentiment/symbol/BTC')
data = response.json()

print(f"BTC sentiment: {data['overallSentiment']}")
print(f"Confidence: {data['confidence']}")
```

### cURL Examples
```bash
# Analyze sentiment
curl -X POST http://localhost:3002/api/v1/sentiment/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "Ethereum looks bullish!", "source": "reddit"}'

# Get symbol sentiment
curl http://localhost:3002/api/v1/sentiment/symbol/ETH

# Health check
curl http://localhost:3002/api/v1/health
```

## Support

For technical support or questions about the Sentiment Analysis Service API:

- **Documentation**: `/docs` (Swagger UI)
- **Health Check**: `/health`
- **Metrics**: `/metrics` (Prometheus format)

---

**Last Updated:** 2025-09-28  
**API Version:** 1.0.0  
**Service Version:** 1.0.0
