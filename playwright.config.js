// Behaviour tests: they drive the real app in a browser, with Google replaced by a fake.
// See tests/README.md.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Pixel 7'],
    // Pixel 7 is a Chromium device; keep the browser that is installed.
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${PORT}`,
    timezoneId: 'Europe/Sofia',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tests/support/serve.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
