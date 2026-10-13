// Rasterize the tracked SVG into PWA icons. Uses the locally installed Chrome, no remote assets.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
  for (const [name, size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0;background:#25282e">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
    await page.screenshot({ path: fileURLToPath(new URL(`../public/${name}`, import.meta.url)) })
  }
} finally { await browser.close() }
