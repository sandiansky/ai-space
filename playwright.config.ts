import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4175', screenshot: 'only-on-failure', trace: 'off' },
  projects: [
    { name: 'Chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'WebKit', use: { ...devices['Desktop Safari'] } }
  ],
  reporter: 'list',
  webServer: { command: 'npm run dev -- --port 4175 --strictPort', url: 'http://127.0.0.1:4175', reuseExistingServer: !process.env.CI }
})
