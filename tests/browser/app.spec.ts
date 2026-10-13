import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// UI tests use an explicit, local protocol fixture, not GPT.GE and never a real API key.
const fixture = { baseUrl: 'https://api.gpt.ge/v1', theme: 'light', stream: true, defaults: { chat: 'gpt-4o', generate: 'nano-banana', edit: 'nano-banana' }, models: [
  { id: 'gpt-4o', adapter: 'chat', categories: ['chat'], source: 'api' },
  { id: 'nano-banana', adapter: 'banana', categories: ['generate', 'edit'], source: 'api' }
] }
const png = readFileSync('public/icon-192.png').toString('base64')

for (const width of [375, 390, 430, 1440]) {
  test(`all pages fit ${width}px and have working navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '今天，想聊点什么？' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: width < 768 ? '底部导航' : '主导航' })
    for (const [name, hash] of [['聊天', 'chat'], [width < 768 ? '图片' : '图片工作台', 'images'], ['设置', 'settings']]) {
      await nav.getByRole('button', { name, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`#${hash}$`))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const overflow = await page.locator('.page-frame:not([hidden])').evaluate(el => el.scrollWidth > el.clientWidth)
      expect(overflow).toBe(false)
    }
    await page.reload()
    await expect(page.getByRole('heading', { name: '连接无限可能。' })).toBeVisible()
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({ path: `artifacts/settings-${width}.png`, fullPage: true })
    await nav.getByRole('button', { name: '聊天', exact: true }).click()
    await page.getByRole('button', { name: '浅色', exact: true }).count() // appearance stays in Settings
    await page.screenshot({ path: `artifacts/chat-dark-${width}.png`, fullPage: true })
  })
}

test('key defaults to session storage and persistence requires explicit confirmation', async ({ page, context }) => {
  await page.goto('/#settings')
  await page.getByLabel('API Key', { exact: true }).fill('test-only-placeholder')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('ai-space:key:v1'))).toBe('test-only-placeholder')
  expect(await page.evaluate(() => localStorage.getItem('ai-space:key:v1'))).toBeNull()
  const freshTab = await context.newPage()
  await freshTab.goto('/#settings')
  await expect(freshTab.getByLabel('API Key', { exact: true })).toHaveValue('')
  await freshTab.close()
  await page.getByRole('checkbox', { name: /在此设备记住密钥/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('ai-space:key:v1'))).toBeNull()
  await page.getByRole('button', { name: '了解风险并保存' }).click()
  expect(await page.evaluate(() => localStorage.getItem('ai-space:key:v1'))).toBe('test-only-placeholder')
  await page.getByRole('checkbox', { name: /在此设备记住密钥/ }).uncheck()
  expect(await page.evaluate(() => localStorage.getItem('ai-space:key:v1'))).toBeNull()
})

test('streamed chat saves history, prevents double submission, and regenerates only after confirmation', async ({ page }) => {
  await page.addInitScript(config => { localStorage.setItem('ai-space:config:v1', JSON.stringify(config)); sessionStorage.setItem('ai-space:key:v1', 'test-only-placeholder') }, fixture)
  let requests = 0
  await page.route('https://api.gpt.ge/v1/chat/completions', async route => {
    requests++
    expect(route.request().headers().authorization).toBe('Bearer test-only-placeholder')
    await new Promise(resolve => setTimeout(resolve, 300))
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"## 测试回答\\n\\n这是协议测试。"}}]}\n\ndata: [DONE]\n\n' })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: '聊天消息' }).fill('测试消息')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.getByRole('button', { name: '停止回答' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '测试回答' })).toBeVisible()
  expect(requests).toBe(1)
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  expect(requests).toBe(1)
  await page.getByRole('button', { name: '确认重新生成' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ai-space:history:v1')!)[0].messages.at(-1).status)).toBe('complete')
  expect(requests).toBe(2)
  await page.reload()
  await page.getByRole('button', { name: '聊天历史' }).click()
  await page.getByRole('button', { name: /^测试消息/ }).click()
  await expect(page.getByRole('heading', { name: '测试回答' })).toBeVisible()
})

test('image edit submits files as multipart and generation separately as JSON', async ({ page }) => {
  await page.addInitScript(config => { localStorage.setItem('ai-space:config:v1', JSON.stringify(config)); sessionStorage.setItem('ai-space:key:v1', 'test-only-placeholder') }, fixture)
  let edits = 0, generations = 0
  await page.route('https://api.gpt.ge/v1/images/edits', async route => {
    edits++
    expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=')
    const body = route.request().postDataBuffer()!.toString()
    expect(body).toContain('name="image"; filename="reference.png"')
    expect(body).toContain('name="prompt"')
    expect(body).toContain('nano-banana')
    await route.fulfill({ json: { data: [{ b64_json: png }] } })
  })
  await page.route('https://api.gpt.ge/v1/images/generations', async route => {
    generations++
    expect(route.request().postDataJSON()).toMatchObject({ model: 'nano-banana', size: '1:1' })
    await route.fulfill({ json: { data: [{ b64_json: png }] } })
  })
  await page.goto('/#images')
  await page.getByLabel('选择参考图片').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByRole('button', { name: '移除参考图 1' })).toBeVisible()
  await page.getByLabel('你想怎么修改？').fill('提亮图片')
  await page.getByRole('button', { name: '开始编辑', exact: true }).click()
  await expect(page.getByText('已返回 1 张图片')).toBeVisible()
  await expect(page.getByLabel('拖动比较原图和效果')).toBeVisible()
  await page.getByRole('button', { name: '并排', exact: true }).click()
  await expect(page.getByAltText('编辑前原图')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存图片', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '图片生成', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '图片生成', exact: true }).click()
  await page.getByRole('button', { name: '生成图片', exact: true }).click()
  await expect(page.getByAltText('AI 生成的图片')).toBeVisible()
  expect(edits).toBe(1); expect(generations).toBe(1)
})

test('failed connection gives an error and no fabricated models', async ({ page }) => {
  await page.route('https://api.gpt.ge/v1/models', route => route.abort('failed'))
  await page.goto('/#settings')
  await page.getByLabel('API Key', { exact: true }).fill('test-only-placeholder')
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByText(/无法连接 API/)).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ai-space:config:v1')!).models.map((m: { id: string }) => m.id))).toEqual(['gpt-6.1-sol', 'gpt-image-2.5-sunburst'])
})

test('requested defaults use GPT Image pixel sizes and a single multipart reference', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('ai-space:key:v1', 'test-only-placeholder'))
  let edits = 0, generations = 0
  await page.route('https://api.gpt.ge/v1/images/edits', async route => {
    edits++
    const body = route.request().postDataBuffer()!.toString()
    expect(body).toContain('gpt-image-2.5-sunburst')
    expect(body).toContain('1024x1024')
    expect(body.match(/name="image";/g)).toHaveLength(1)
    expect(body).not.toContain('aspect_ratio')
    await route.fulfill({ json: { data: [{ b64_json: png }] } })
  })
  await page.route('https://api.gpt.ge/v1/images/generations', async route => {
    generations++
    expect(route.request().postDataJSON()).toMatchObject({ model: 'gpt-image-2.5-sunburst', n: 1, size: '1024x1024' })
    await route.fulfill({ json: { data: [{ b64_json: png }] } })
  })
  await page.goto('/')
  await expect(page.getByLabel('聊天模型', { exact: true })).toHaveValue('gpt-6.1-sol')
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '图片工作台', exact: true }).click()
  await expect(page.getByLabel('图片编辑模型', { exact: true })).toHaveValue('gpt-image-2.5-sunburst')
  await expect(page.getByRole('combobox', { name: '图片尺寸', exact: true })).toHaveValue('1024x1024')
  await page.getByLabel('选择参考图片').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByRole('button', { name: /添加你的照片/ })).toBeDisabled()
  await page.getByLabel('你想怎么修改？').fill('将蓝色改为橙色')
  await page.getByRole('button', { name: '开始编辑', exact: true }).click()
  await expect(page.getByText('已返回 1 张图片')).toBeVisible()
  await page.getByRole('button', { name: '图片生成', exact: true }).click()
  await page.getByRole('button', { name: '生成图片', exact: true }).click()
  await expect(page.getByAltText('AI 生成的图片')).toBeVisible()
  expect(edits).toBe(1); expect(generations).toBe(1)
})
