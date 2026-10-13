import { chromium, webkit } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('artifacts', { recursive: true })
const report = []
for (const [name, engine, options] of [['Chrome', chromium, { channel: 'chrome' }], ['WebKit', webkit, {}]]) {
  const browser = await engine.launch({ ...options, headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage(), pageErrors = []
    page.on('pageerror', e => pageErrors.push(e.message))
    const response = await page.goto('http://127.0.0.1:4176/ai-space/')
    if (response?.status() !== 200) throw new Error('Production HTML failed')
    await page.getByRole('heading', { name: '今天，想聊点什么？' }).waitFor()
    await page.screenshot({ path: `artifacts/chat-light-${name}-390.png` })
    await page.getByRole('navigation', { name: '底部导航' }).getByRole('button', { name: '图片', exact: true }).click()
    await page.screenshot({ path: `artifacts/images-light-${name}-390.png` })
    await page.evaluate(async () => await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker activation timed out')), 20000))]))
    // Prompt updates intentionally do not claim a running page. A reload attaches the first worker.
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    const manifest = await page.evaluate(async () => await (await fetch(document.querySelector('link[rel="manifest"]').href)).json())
    if (manifest.start_url !== '/ai-space/' || manifest.scope !== '/ai-space/') throw new Error('Manifest scope mismatch')
    const initialApiCache = await page.evaluate(async () => {
      const keys = await caches.keys()
      const urls = (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat()
      return urls.filter(url => url.includes('api.gpt.ge'))
    })
    if (initialApiCache.length) throw new Error('API response entered offline cache')
    await context.setOffline(true)
    await page.reload()
    await page.getByRole('heading', { name: '让画面，如你所想。' }).waitFor()
    await context.setOffline(false)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '图片工作台', exact: true }).click()
    await page.screenshot({ path: `artifacts/images-light-${name}-1440.png` })
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '聊天', exact: true }).click()
    await page.screenshot({ path: `artifacts/chat-light-${name}-1440.png` })
    report.push({ browser: name, subpath: '/ai-space/', htmlStatus: response.status(), manifestScope: manifest.scope, serviceWorkerOfflineReload: true, cachedApiResponses: initialApiCache.length, pageErrors })
    if (pageErrors.length) throw new Error('Page errors found')
  } finally { await browser.close() }
}
await writeFile('docs/production-check.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
