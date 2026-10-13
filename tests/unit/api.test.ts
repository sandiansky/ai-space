import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat, chatBody, editBody, editImage, generateImage, getModels, imageParameters, normalizeBase, parseImages, readChat } from '../../src/api'
import { inferModel, mergeModels, preferredDefaults, referenceLimit } from '../../src/models'
import type { Message, Model } from '../../src/types'

const model = (id: string): Model => ({ id, ...inferModel(id), source: 'api' })
const credentials = { baseUrl: 'https://api.gpt.ge/v1', key: 'test-only-placeholder' }
const signal = () => new AbortController().signal
const messages: Message[] = [{ id: 'a', role: 'user', content: '你好', status: 'complete' }]
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('documented model adaptation', () => {
  it('uses the requested defaults and separate GPT Image pixel parameters', () => {
    expect(preferredDefaults.chat).toBe('gpt-6.1-sol')
    expect(preferredDefaults.edit).toBe('gpt-image-2.5-sunburst')
    expect(model(preferredDefaults.chat).adapter).toBe('reasoning')
    expect(imageParameters(model(preferredDefaults.edit), 'photo', '1024x1024', '4K')).toEqual({ model: preferredDefaults.edit, prompt: 'photo', size: '1024x1024', n: '1' })
    expect(() => imageParameters(model(preferredDefaults.edit), 'photo', '1:1', '1K')).toThrow('像素尺寸')
    expect(referenceLimit(model(preferredDefaults.edit))).toBe(1)
    expect(referenceLimit(model('nano-banana'))).toBe(6)
  })
  it('uses separate basic, pro and fixed-resolution parameter formats', () => {
    expect(imageParameters(model('nano-banana'), 'photo', '2:3', '4K')).toEqual({ model: 'nano-banana', prompt: 'photo', size: '2:3' })
    expect(imageParameters(model('nano-banana-pro'), 'photo', '2:3', '4K')).toEqual({ model: 'nano-banana-pro', prompt: 'photo', size: '4K', aspect_ratio: '2:3' })
    expect(imageParameters(model('nano-banana-pro-2k'), 'photo', '2:3', '4K')).toEqual({ model: 'nano-banana-pro-2k', prompt: 'photo', size: '2:3' })
    expect(() => imageParameters(model('unknown-image'), 'x', '1:1', '1K')).toThrow('适配器')
  })
  it('does not auto-enable unknown media models and retains explicit custom overrides', () => {
    expect(inferModel('new-image-model').categories).toEqual([])
    for (const id of ['gpt-4o', 'claude-sonnet-4-5', 'gemini-2.5-pro', 'glm-4.5']) expect(inferModel(id).categories).toEqual(['chat'])
    const custom: Model = { id: 'nano-banana', adapter: 'banana-pro', source: 'custom', categories: ['edit'] }
    expect(mergeModels(['nano-banana', 'nano-banana', 'gpt-4o'], [custom])).toHaveLength(2)
    expect(mergeModels(['nano-banana'], [custom])[0]).toEqual(custom)
  })
  it('keeps reasoning parameters distinct and o1 non-streaming', () => {
    expect(chatBody(model('o1-mini'), messages, true)).toMatchObject({ stream: false, max_completion_tokens: 4096 })
    expect(chatBody(model('gpt-5'), messages, true)).not.toHaveProperty('temperature')
    expect(chatBody(model('gpt-4o'), messages, true)).not.toHaveProperty('max_completion_tokens')
    expect(chatBody(model('gpt-4o'), messages, true).messages).toEqual([{ role: 'user', content: '你好' }])
  })
})
describe('image transport and validation', () => {
  it('sends GPT Image generation count as JSON number and edit count as a form field', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ data: [{ url: 'https://images.example/result.png' }] })))
    vi.stubGlobal('fetch', fetcher)
    const imageModel = model('gpt-image-2.5-sunburst')
    await generateImage(credentials, imageModel, 'draw', '1024x1024', '1K', signal())
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ model: imageModel.id, prompt: 'draw', n: 1, size: '1024x1024' })
    await editImage(credentials, imageModel, 'edit', '1024x1024', '1K', [new File(['a'], 'reference.png')], signal())
    expect(fetcher.mock.calls[1][1].body.get('n')).toBe('1')
    expect(fetcher.mock.calls[1][1].body.get('aspect_ratio')).toBeNull()
    await expect(editImage(credentials, imageModel, 'edit', '1024x1024', '1K', Array(2).fill(new File(['a'],'r.png')), signal())).rejects.toThrow('一张')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('uses repeated documented image fields with real File objects', () => {
    const files = [new File(['a'], 'one.png', { type: 'image/png' }), new File(['b'], 'two.png', { type: 'image/png' })]
    const form = editBody({ model: 'nano-banana', prompt: 'change light' }, files)
    expect(form.getAll('image').map(f => (f as File).name)).toEqual(['one.png', 'two.png'])
    expect(form.get('model')).toBe('nano-banana')
    expect(() => editBody({}, [])).toThrow('1–6')
    expect(() => editBody({}, Array(7).fill(files[0]))).toThrow('1–6')
  })
  it('sends generation JSON and editing multipart to independent endpoints', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ data: [{ url: 'https://images.example/result.png' }] })))
    vi.stubGlobal('fetch', fetcher)
    await generateImage(credentials, model('nano-banana'), 'draw', '1:1', '1K', signal())
    await editImage(credentials, model('nano-banana'), 'edit', '1:1', '1K', [new File(['a'], 'one.png')], signal())
    expect(fetcher.mock.calls[0][0]).toBe('https://api.gpt.ge/v1/images/generations')
    expect(fetcher.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json')
    expect(fetcher.mock.calls[1][0]).toBe('https://api.gpt.ge/v1/images/edits')
    expect(fetcher.mock.calls[1][1].headers.has('Content-Type')).toBe(false)
    expect(fetcher.mock.calls[1][1].body).toBeInstanceOf(FormData)
    expect(fetcher.mock.calls[1][1].credentials).toBe('omit')
  })
  it('accepts URL and base64; rejects text-only and unsafe results', () => {
    expect(parseImages({ data: [{ b64_json: 'iVBORw0KGgo=' }] })[0].src).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(parseImages({ data: [{ url: 'https://example.com/image.png' }] })[0].src).toContain('https://')
    expect(() => parseImages({ choices: [{ message: { content: 'a nice picture' } }] })).toThrow('文字描述')
    expect(() => parseImages({ data: [{ url: 'javascript:alert(1)' }] })).toThrow('不安全')
  })
})
describe('chat response correctness', () => {
  it('parses SSE one byte at a time, including split UTF-8 and CRLF', async () => {
    const events = 'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"世界"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n'
    const bytes = new TextEncoder().encode(events)
    const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } })
    const onText = vi.fn()
    await readChat(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), onText)
    expect(onText.mock.calls.map(c => c[0])).toEqual(['你好', '你好世界'])
  })
  it('preserves partial content and signals a disconnected stream', async () => {
    const onText = vi.fn()
    await expect(readChat(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }), onText)).rejects.toThrow('提前断开')
    expect(onText).toHaveBeenCalledWith('partial')
  })
  it('accepts non-streaming JSON and rejects a malformed stream', async () => {
    const onText = vi.fn()
    await readChat(Response.json({ choices: [{ message: { content: 'answer' } }] }), onText)
    expect(onText).toHaveBeenCalledWith('answer')
    await expect(readChat(new Response('data: broken\n\n', { headers: { 'Content-Type': 'text/event-stream' } }), vi.fn())).rejects.toThrow('无法解析')
  })
})
describe('safe failures', () => {
  it('recognizes an upstream overload inside HTTP 200 SSE without inventing an HTTP failure or retrying', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"error":{"type":"upstream_error","message":"Our servers are currently overloaded. Please try again later."}}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetcher)
    const error = await chat(credentials, model('gpt-6.1-sol'), messages, true, signal(), vi.fn()).catch(e => e)
    expect(error.message).toContain('上游服务当前繁忙')
    expect(error.message).not.toContain('HTTP 400')
    expect(error.kind).toBe('upstream')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('never includes provider error content or retries a paid request', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { message: 'invalid ' + credentials.key } }, { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    const error = await chat(credentials, model('gpt-4o'), messages, true, signal(), vi.fn()).catch(e => e)
    expect(error.message).toContain('无效')
    expect(error.message).not.toContain(credentials.key)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([[402, 'balance', '余额'], [413, '', '图片'], [429, '', '频繁'], [404, 'model', '模型']])('maps HTTP %s failures', async (status, code, text) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code } }, { status: Number(status) })))
    await expect(getModels(credentials, signal())).rejects.toThrow(String(text))
  })
  it('validates the model list and reports network/CORS failure', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [{ nope: true }] })))
    await expect(getModels(credentials, signal())).rejects.toThrow('格式异常')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getModels(credentials, signal())).rejects.toThrow('CORS')
  })
  it('times out without retrying', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))) }))
    vi.stubGlobal('fetch', fetcher)
    const pending = getModels(credentials, signal()).catch(e => e)
    await vi.advanceTimersByTimeAsync(20001)
    expect((await pending).message).toContain('超时')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects HTTP, embedded credentials and query-string secrets in base URLs', () => {
    for (const value of ['http://example.com/v1', 'https://user:key@example.com', 'https://example.com?key=secret']) expect(() => normalizeBase(value)).toThrow()
    expect(normalizeBase('https://api.gpt.ge/v1/')).toBe('https://api.gpt.ge/v1')
  })
})
