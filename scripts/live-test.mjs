// Interactive diagnostics. Credentials stay in process memory and arrive through hidden stdin.
// Never pass an API key as a shell argument, environment file, or tracked source.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'

const base = 'https://api.gpt.ge/v1'
let key = '', queue = Promise.resolve(), input = ''
let report = { checkedAt: new Date().toISOString(), models: null, calls: [] }
try { report = JSON.parse(await readFile('docs/live-check.json', 'utf8')) } catch { /* first run */ }
async function record() { await mkdir('docs', { recursive: true }); await writeFile('docs/live-check.json', JSON.stringify(report, null, 2) + '\n') }
async function call(path, init, label) {
  const started = Date.now()
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${key}`)
  const response = await fetch(`${base}/${path}`, { ...init, headers, signal: AbortSignal.timeout(300000) })
  const meta = { label, status: response.status, elapsedSeconds: 0, contentType: response.headers.get('content-type') }
  return { response, meta, started }
}
async function run(command) {
  if (command.key) { key = command.key; console.log('Credential loaded in memory.'); return }
  if (command.action === 'exit') { key = ''; process.exit(0) }
  if (!key) throw new Error('Credential required via hidden stdin.')
  if (command.action === 'models') {
    const { response } = await call('models', { method: 'GET' }, 'models')
    const body = await response.json()
    const ids = Array.isArray(body.data) ? body.data.map(m => m.id) : []
    const result = { status: response.status, count: ids.length, requested: ['gpt-6.1-sol','gpt-image-2.5-sunburst'].map(id => ({ id, listed: ids.includes(id) })), relevant: ids.filter(id => /gpt-6|gpt-image/.test(id)) }
    report.models = result; await record(); console.log(JSON.stringify(result)); return
  }
  if (command.action === 'chat') {
    const payload = { model: 'gpt-6.1-sol', messages: command.messages || [{ role: 'user', content: '请只回复：AI Space 连接成功。' }], stream: true }
    if (command.maxCompletionTokens) payload.max_completion_tokens = command.maxCompletionTokens
    const { response, meta, started } = await call('chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, command.label || 'gpt-6.1-sol streaming chat')
    let body = ''; const decoder = new TextDecoder()
    for await (const chunk of response.body) body += decoder.decode(chunk, { stream: true })
    body += decoder.decode()
    const events = body.split(/\r?\n/).filter(line => line.startsWith('data: ')).map(line => line.slice(6)).filter(line => line !== '[DONE]').map(line => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
    const reply = events.map(event => event.choices?.[0]?.delta?.content || '').join('')
    meta.elapsedSeconds = Math.round((Date.now() - started) / 1000); meta.streamEvents = events.length; meta.finished = body.includes('[DONE]') || events.some(event => event.choices?.[0]?.finish_reason); meta.reply = reply.replaceAll(key, '[redacted]').slice(0,500)
    meta.eventDetails = events.map(event => ({ fields: Object.keys(event), finishReason: event.choices?.[0]?.finish_reason, deltaFields: Object.keys(event.choices?.[0]?.delta || {}), error: event.error ? { type: event.error.type, code: event.error.code, message: String(event.error.message || '').replaceAll(key, '[redacted]').replace(/sk-[\w-]+/g, '[redacted]') } : undefined }))
    meta.success = response.ok && Boolean(reply.trim()) && !events.some(event => event.error)
    if (!response.ok) { let json; try { json = JSON.parse(body) } catch {} meta.errorType = json?.error?.type; meta.errorCode = json?.error?.code; meta.errorMessage = String(json?.error?.message || 'Request failed').replaceAll(key, '[redacted]').replace(/sk-[\w-]+/g, '[redacted]') }
    report.calls.push(meta); await record(); console.log(JSON.stringify(meta)); return
  }
  if (command.action === 'generate' || command.action === 'edit') {
    let init, path
    if (command.action === 'generate') {
      path = 'images/generations'
      init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-2.5-sunburst', prompt: 'A single solid blue circle centered on a plain white background. Minimal flat graphic. No text.', n: 1, size: '1024x1024' }) }
    } else {
      path = 'images/edits'
      const form = new FormData(); form.append('model','gpt-image-2.5-sunburst'); form.append('prompt','Change the blue circle to a vivid orange circle. Keep the same white background and composition. No text.'); form.append('n','1'); form.append('size','1024x1024')
      form.append('image', new Blob([await readFile('artifacts/live-generated.png')], { type: 'image/png' }), 'reference.png')
      init = { method: 'POST', body: form }
    }
    const { response, meta, started } = await call(path, init, `gpt-image-2.5-sunburst ${command.action}`)
    const body = await response.json()
    meta.elapsedSeconds = Math.round((Date.now() - started) / 1000)
    if (!response.ok) { meta.errorType = body.error?.type; meta.errorCode = body.error?.code; meta.errorMessage = String(body.error?.message || 'Request failed').replaceAll(key, '[redacted]').replace(/sk-[\w-]+/g, '[redacted]') }
    meta.topLevelFields = Object.keys(body); meta.images = Array.isArray(body.data) ? body.data.map(item => ({ fields: Object.keys(item), format: item.b64_json ? 'base64' : item.url ? 'url' : 'unknown', width: item.width, height: item.height })) : []
    if (body.data?.[0]) {
      const item = body.data[0]
      let bytes
      if (item.b64_json) bytes = Buffer.from(item.b64_json, 'base64')
      else if (item.url && new URL(item.url).protocol === 'https:') {
        const imageResponse = await fetch(item.url, { signal: AbortSignal.timeout(30000) })
        if (imageResponse.ok) bytes = Buffer.from(await imageResponse.arrayBuffer())
      }
      if (bytes) { await mkdir('artifacts', { recursive: true }); const file = `artifacts/live-${command.action === 'generate' ? 'generated' : 'edited'}.png`; await writeFile(file, bytes); meta.savedFile = file; meta.bytes = bytes.length }
    }
    report.calls.push(meta); await record(); console.log(JSON.stringify(meta)); return
  }
  throw new Error('Unknown action')
}
function enqueue(line) {
  queue = queue.then(async () => { try { await run(JSON.parse(line)) } catch (error) { console.log(JSON.stringify({ failed: true, reason: error?.cause?.code || error?.name || 'error' })) } console.log('Ready for next command.') })
}
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true); process.stdin.resume()
  process.stdin.on('data', chunk => {
    input += chunk.toString(); let boundary
    while ((boundary = input.search(/[\r\n]/)) !== -1) { const line = input.slice(0,boundary); input = input.slice(boundary+1); if (line.trim()) enqueue(line) }
  })
} else {
  createInterface({ input: process.stdin, terminal: false }).on('line', enqueue)
}
console.log('Ready for JSON on stdin (input is hidden).')
