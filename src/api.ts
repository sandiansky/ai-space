import type { ImageResult, Message, Model } from './types'
import { gptImageSizes } from './models'
export interface Credentials { baseUrl: string; key: string }
export class ApiError extends Error { constructor(message: string, public kind = 'api') { super(message) } }
export function normalizeBase(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new ApiError('请输入有效的 HTTPS API 地址。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ApiError('API 地址必须使用 HTTPS，不能包含账号、查询参数或片段。')
  return url.href.replace(/\/+$/, '')
}
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return '请求未完成。请检查网络与 API 配置后手动重试。'
}
function statusError(status: number | undefined, body: unknown): never {
  // Never echo a provider message; it may contain credentials or private request content.
  const b = body as { error?: { code?: string; type?: string; message?: string } } | null
  const hint = [b?.error?.code, b?.error?.type, b?.error?.message].join(' ').toLowerCase()
  if (/quota|balance|credit|insufficient|余额|额度/.test(hint) || status === 402) throw new ApiError('余额或额度不足，请前往 GPT.GE 检查账户。', 'balance')
  if (status === 401) throw new ApiError('API Key 无效或已过期，请在设置中重新填写。', 'auth')
  if (status === 403) throw new ApiError('此令牌没有访问权限，请检查分组与模型权限。', 'auth')
  if (status === 413) throw new ApiError('图片超过服务端限制，请压缩后重新选择。', 'size')
  if (/model|channel|模型|渠道/.test(hint) || status === 404) throw new ApiError('模型或接口当前不可用，请刷新模型列表、检查分组或选择其他模型。', 'model')
  if (status === 429) throw new ApiError('请求过于频繁或额度受限，请稍后手动重试。', 'rate')
  if (/overload|capacity|servers? busy|过载|繁忙/.test(hint)) throw new ApiError('模型上游服务当前繁忙，请稍后手动重试；不会自动重复请求。', 'upstream')
  throw new ApiError(status === undefined ? '服务在响应中报告错误，未完成本次请求。请稍后检查服务状态，不会自动重试。' : `服务返回错误（HTTP ${status}）。请稍后检查服务状态，不会自动重试。`)
}
async function withRequest<T>(c: Credentials, path: string, init: RequestInit, signal: AbortSignal, timeout: number, consume: (response: Response) => Promise<T>): Promise<T> {
  const base = normalizeBase(c.baseUrl)
  if (!c.key.trim()) throw new ApiError('请先在设置中填写 API Key。', 'auth')
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  try {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${c.key.trim()}`)
    const response = await fetch(`${base}/${path}`, { ...init, headers, signal: controller.signal, credentials: 'omit', mode: 'cors', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      statusError(response.status, body)
    }
    return await consume(response)
  } catch (error) {
    if (timedOut) throw new ApiError('请求超时，服务端可能仍在处理并计费。请先检查账户记录，不要立即重复提交。', 'timeout')
    if (signal.aborted) throw new ApiError('已停止等待；服务端可能仍在处理并计费。', 'aborted')
    if (error instanceof ApiError) throw error
    if (error instanceof SyntaxError) throw new ApiError('服务返回的数据格式异常，未获得有效结果。', 'format')
    throw new ApiError(typeof navigator !== 'undefined' && !navigator.onLine ? '网络已断开，请联网后手动重试。' : '无法连接 API：可能是网络、跨域（CORS）或服务器限制。Authorization 必须被服务端显式允许。请检查设置中的跨域说明。', 'network')
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}
export async function getModels(c: Credentials, signal: AbortSignal): Promise<string[]> {
  return withRequest(c, 'models', { method: 'GET' }, signal, 20000, async r => {
    const body = await r.json()
    if (!Array.isArray(body.data) || body.data.some((m: { id?: unknown }) => typeof m?.id !== 'string')) throw new ApiError('模型列表格式异常。', 'format')
    return body.data.map((m: { id: string }) => m.id)
  })
}
export function chatBody(model: Model, messages: Message[], stream: boolean) {
  const body: Record<string, unknown> = { model: model.id, messages: messages.map(({ role, content }) => ({ role, content })), stream: model.adapter === 'o1' ? false : stream }
  if (model.adapter === 'o1' || model.adapter === 'reasoning') body.max_completion_tokens = 4096
  return body
}
// Parse complete SSE events, preserving UTF-8 and CRLF boundaries across arbitrary network chunks.
export async function readChat(response: Response, onText: (text: string) => void) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const body = await response.json()
    if (body.error) statusError(undefined, body)
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new ApiError('服务没有返回文字回答。', 'format')
    onText(content); return
  }
  if (!response.body) throw new ApiError('浏览器未收到可读的流式响应。', 'format')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', output = '', done = false, finished = false
  const event = (block: string) => {
    const payload = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n').trim()
    if (!payload) return
    if (payload === '[DONE]') { done = true; return }
    let data
    try { data = JSON.parse(payload) } catch { throw new ApiError('流式响应包含无法解析的数据。', 'format') }
    if (data.error) statusError(undefined, data)
    const choice = data.choices?.[0]
    if (choice?.finish_reason) finished = true
    const text = choice?.delta?.content
    if (typeof text === 'string') { output += text; onText(output) }
  }
  try {
    while (!done) {
      const chunk = await reader.read()
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      let boundary
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0, boundary.index))
        buffer = buffer.slice(boundary.index + boundary[0].length)
        if (done) break
      }
      if (chunk.done) { if (buffer.trim()) event(buffer); break }
    }
    if (!output.trim()) throw new ApiError('服务没有返回文字回答。', 'format')
    if (!done && !finished) throw new ApiError('连接提前断开，已保留收到的部分回答。', 'network')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export async function chat(c: Credentials, model: Model, messages: Message[], stream: boolean, signal: AbortSignal, onText: (text: string) => void) {
  return withRequest(c, 'chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chatBody(model, messages, stream)) }, signal, 180000, r => readChat(r, onText))
}
export function imageParameters(model: Model, prompt: string, ratio: string, resolution: string): Record<string, string> {
  if (model.adapter === 'gpt-image') {
    if (!gptImageSizes.includes(ratio)) throw new ApiError('GPT Image 请选择支持的像素尺寸。', 'size')
    return { model: model.id, prompt, n: '1', size: ratio }
  }
  if (!['banana', 'banana-pro', 'banana-fixed'].includes(model.adapter)) throw new ApiError('该模型尚未配置已验证的图片适配器，请在设置中指定。', 'model')
  return { model: model.id, prompt, ...(model.adapter === 'banana-pro' ? { size: resolution, aspect_ratio: ratio } : { size: ratio }) }
}
export function editBody(params: Record<string, string>, files: File[]) {
  if (!files.length || files.length > 6) throw new ApiError('Nano Banana 编辑需要 1–6 张参考图。', 'size')
  const form = new FormData()
  Object.entries(params).forEach(([key, value]) => form.append(key, value))
  files.forEach(file => form.append('image', file, file.name))
  return form
}
export function parseImages(body: unknown): ImageResult[] {
  const data = (body as { data?: unknown })?.data
  if (!Array.isArray(data) || !data.length) throw new ApiError('服务没有返回图片；文字描述不会被当作图片结果。', 'format')
  return data.map(item => {
    if (typeof item?.b64_json === 'string' && item.b64_json) {
      const b64 = item.b64_json.replace(/\s/g, '')
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new ApiError('图片 base64 数据异常。', 'format')
      const mime = b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklGR') ? 'image/webp' : 'image/png'
      return { src: `data:${mime};base64,${b64}`, revisedPrompt: item.revised_prompt }
    }
    if (typeof item?.url === 'string') {
      try { const url = new URL(item.url); if (url.protocol === 'https:') return { src: url.href, revisedPrompt: item.revised_prompt } } catch { /* invalid URL */ }
    }
    throw new ApiError('图片返回格式不受支持或图片地址不安全。', 'format')
  })
}
async function imageResponse(response: Response) { const body = await response.json(); if (body.error) statusError(undefined, body); return parseImages(body) }
export async function generateImage(c: Credentials, model: Model, prompt: string, ratio: string, resolution: string, signal: AbortSignal) {
  const params = imageParameters(model, prompt, ratio, resolution)
  return withRequest(c, 'images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model.adapter === 'gpt-image' ? { ...params, n: 1 } : params) }, signal, 300000, imageResponse)
}
export async function editImage(c: Credentials, model: Model, prompt: string, ratio: string, resolution: string, files: File[], signal: AbortSignal) {
  if (model.adapter === 'gpt-image' && files.length !== 1) throw new ApiError('当前 GPT Image 适配器使用一张参考图，请移除多余图片。', 'size')
  // Do not set Content-Type: the browser supplies the multipart boundary.
  return withRequest(c, 'images/edits', { method: 'POST', body: editBody(imageParameters(model, prompt, ratio, resolution), files) }, signal, 300000, imageResponse)
}
