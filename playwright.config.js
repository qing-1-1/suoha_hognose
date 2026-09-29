const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 30000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH} : {}, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  reporter: [['list']],
  projects: [{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]
});
