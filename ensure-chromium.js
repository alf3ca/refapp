#!/usr/bin/env node
/**
 * Ensure Chromium is installed before app startup
 */
const puppeteer = require('puppeteer');

console.log('🔍 [STARTUP] Checking if Chromium is available...');
console.log('📌 NODE_ENV:', process.env.NODE_ENV);

// Attempt to download chromium if needed
async function ensureChromium() {
  try {
    console.log('⏳ Testing Puppeteer/Chromium availability...');
    
    // This will trigger a download if chromium doesn't exist
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    console.log('✅ [STARTUP] Chromium is available and working!');
    await browser.close();
    return true;
    
  } catch (error) {
    console.error('❌ [STARTUP] Error checking Chromium:', error.message);
    
    // Try to use browserFetcher to install
    console.log('📥 [STARTUP] Attempting to download Chromium via BrowserFetcher...');
    try {
      const browserFetcher = puppeteer.createBrowserFetcher();
      const revisionInfo = await browserFetcher.download('146');
      console.log('✅ [STARTUP] Chromium downloaded to:', revisionInfo.executablePath);
      return true;
    } catch (fetchErr) {
      console.error('❌ [STARTUP] BrowserFetcher failed:', fetchErr.message);
      console.log('⚠️  [STARTUP] Proceeding without Chromium. Users may see errors during import.');
      return false;
    }
  }
}

// Run the check
ensureChromium()
  .then(() => {
    console.log('✅ [STARTUP] Chromium check complete, starting app...');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ [STARTUP] Fatal error:', err.message);
    console.log('⚠️  [STARTUP] Proceeding anyway...');
    process.exit(0);
  });

// Timeout after 120 seconds
setTimeout(() => {
  console.log('⏱️  [STARTUP] Chromium check timed out (120s), proceeding with app startup...');
  process.exit(0);
}, 120000);

