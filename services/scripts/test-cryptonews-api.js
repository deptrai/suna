#!/usr/bin/env node

/**
 * Test script for CryptoNews.net API
 * Usage: node services/scripts/test-cryptonews-api.js
 */

const API_KEY = 'jitd4itgdlhjodhftnzl2icxfutjxstzsacpdmyn';
const BASE_URL = 'https://cryptonews-api.com/api/v1';

async function testCryptoNewsAPI() {
  console.log('🔍 Testing CryptoNews.net API...\n');
  
  // Test 1: General category
  console.log('Test 1: Fetching general crypto news...');
  try {
    const url = `${BASE_URL}/category?section=general&items=5&token=${API_KEY}`;
    console.log(`URL: ${url}\n`);
    
    const response = await fetch(url);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success!');
      console.log(`Total articles: ${data.data?.length || 0}`);
      if (data.data && data.data.length > 0) {
        console.log('\nFirst article:');
        console.log(`  Title: ${data.data[0].title}`);
        console.log(`  Source: ${data.data[0].source_name}`);
        console.log(`  Date: ${data.data[0].date}`);
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Failed!');
      console.log(`Error: ${errorText}`);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 2: Altcoin category
  console.log('Test 2: Fetching altcoin news...');
  try {
    const url = `${BASE_URL}/category?section=altcoin&items=3&token=${API_KEY}`;
    console.log(`URL: ${url}\n`);
    
    const response = await fetch(url);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success!');
      console.log(`Total articles: ${data.data?.length || 0}`);
    } else {
      const errorText = await response.text();
      console.log('❌ Failed!');
      console.log(`Error: ${errorText}`);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 3: Check API rate limits
  console.log('Test 3: Checking API info...');
  try {
    const url = `${BASE_URL}/category?section=general&items=1&token=${API_KEY}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const headers = response.headers;
      console.log('Response Headers:');
      console.log(`  Content-Type: ${headers.get('content-type')}`);
      console.log(`  X-RateLimit-Limit: ${headers.get('x-ratelimit-limit') || 'N/A'}`);
      console.log(`  X-RateLimit-Remaining: ${headers.get('x-ratelimit-remaining') || 'N/A'}`);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  console.log('\n✅ CryptoNews.net API test completed!');
}

// Run the test
testCryptoNewsAPI().catch(console.error);

