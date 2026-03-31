// Skip Chromium download to reduce build size and memory usage
// Useful for Render free tier deployment
module.exports = {
  skipChromeDownload: true,
  defaultBrowserType: 'chrome'
};
