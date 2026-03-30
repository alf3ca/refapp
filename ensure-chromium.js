#!/usr/bin/env node
/**
 * Ensure Chromium is installed before app startup
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking if Chromium is available...');

try {
  // Try to require puppeteer and check if it can find chromium
  const puppeteer = require('puppeteer');
  
  console.log('✅ Puppeteer is installed');
  console.log('📌 Cache directory:', process.env.PUPPETEER_CACHE_DIR || 'default');
  
  // Try launching to see if chromium exists
  puppeteer.launch({ headless: true })
    .then(browser => {
      console.log('✅ Chromium is available and working!');
      browser.close();
      process.exit(0);
    })
    .catch(err => {
      console.log('⚠️  Chromium not found, attempting to install...');
      console.log('Error was:', err.message);
      
      try {
        console.log('📥 Running: npx @puppeteer/browsers install chrome');
        execSync('npx @puppeteer/browsers install chrome', { stdio: 'inherit' });
        console.log('✅ Chromium installed successfully');
        process.exit(0);
      } catch (installErr) {
        console.error('❌ Failed to install Chromium:', installErr.message);
        console.log('⚠️  App will start but Centre Circle import may not work');
        process.exit(0); // Don't block app startup
      }
    });
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}

// Timeout after 60 seconds
setTimeout(() => {
  console.log('⏱️ Chromium check timed out, proceeding with app startup...');
  process.exit(0);
}, 60000);
