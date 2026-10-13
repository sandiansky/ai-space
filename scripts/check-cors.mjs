// No user credential is read. Invalid markers only; every live request should fail authentication.
import { chromium, webkit } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
const origin = 'https://ai-space-example.github.io'
const endpoints = [['models','GET','authorization'],['chat/completions','POST','authorization,content-type'],['images/generations','POST','authorization,content-type'],['images/edits','POST','authorization']]
const preflights = []
for (const [path, method, headers] of endpoints) {
  const r = await fetch(`https://api.gpt.ge/v1/${path}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers }, signal: AbortSignal.timeout(20000) })
  preflights.push({ path, status: r.status, allowOrigin: r.headers.get('access-control-allow-origin'), allowHeaders: r.headers.get('access-control-allow-headers'), allowMethods: r.headers.get('access-control-allow-methods') })
}
const browsers = []
for (const [name, engine, options] of [['Chrome', chromium, { channel: 'chrome', headless: true }], ['WebKit', webkit, { headless: true }]]) {
  const browser = await engine.launch(options)
  try {
  const page = await browser.newPage()
  const errors = []
  const wirePreflights = []
  if (name === 'Chrome') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    cdp.on('Network.responseReceived', event => { if (event.type === 'Preflight') wirePreflights.push({ url: event.response.url, status: event.response.status, headers: event.response.headers }) })
  }
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  // No routing/interception: Chromium must enforce its native CORS checks.
  await page.goto('https://mdn.github.io/dom-examples/', { waitUntil: 'domcontentloaded' })
  const browserResult = await page.evaluate(async () => {
    const results = []
    for (const path of ['models', 'chat/completions', 'images/generations', 'images/edits']) {
      const headers = { Authorization: 'Bearer cors-probe-not-a-real-key' }
      let init = { method: path === 'models' ? 'GET' : 'POST', credentials: 'omit', headers, signal: AbortSignal.timeout(20000) }
      if (path === 'images/edits') { const body = new FormData(); body.append('prompt', 'cors-test'); init.body = body }
      else if (path !== 'models') { headers['Content-Type'] = 'application/json'; init.body = '{}' }
      try { const r = await fetch(`https://api.gpt.ge/v1/${path}`, init); results.push({ path, readable: true, status: r.status }) }
      catch (e) { results.push({ path, readable: false, error: e instanceof Error ? e.message : 'fetch failed' }) }
    }
    return results
  })
  browsers.push({ name, version: browser.version(), origin: new URL(page.url()).origin, result: browserResult, wirePreflights, consoleErrors: errors })
  } finally { await browser.close() }
}
const report = { checkedAt: new Date().toISOString(), preflightOrigin: origin, note: 'Real GitHub Pages document; no routing/interception, live OPTIONS/GET/POST, only deliberately invalid credentials, no paid requests. Actual deployment origin and valid-key success still need retesting.', preflights, browsers }
await mkdir('docs', { recursive: true })
await writeFile('docs/cors-check.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
