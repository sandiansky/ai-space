import type { Config, Conversation } from './types'
import { preferredDefaults } from './models'
const CONFIG = 'ai-space:config:v1', HISTORY = 'ai-space:history:v1', KEY = 'ai-space:key:v1'
export const initialConfig: Config = {
  baseUrl: 'https://api.gpt.ge/v1', models: [
    { id: preferredDefaults.chat, adapter: 'reasoning', categories: ['chat'], source: 'custom' },
    { id: preferredDefaults.generate, adapter: 'gpt-image', categories: ['generate', 'edit'], source: 'custom' }
  ], defaults: { ...preferredDefaults }, theme: 'system', stream: true
}
function read(storage: Storage, name: string) { try { return storage.getItem(name) } catch { return null } }
export function loadConfig(): Config {
  try {
    const c = JSON.parse(read(localStorage, CONFIG) || 'null')
    if (!c || !Array.isArray(c.models)) return initialConfig
    return { ...initialConfig, ...c, defaults: { ...initialConfig.defaults, ...c.defaults } }
  } catch { return initialConfig }
}
export function saveConfig(config: Config) { localStorage.setItem(CONFIG, JSON.stringify(config)) }
export function loadKey() { return read(sessionStorage, KEY) || read(localStorage, KEY) || '' }
export function isPersistent() { return Boolean(read(localStorage, KEY)) }
export function saveKey(key: string, persist: boolean) {
  localStorage.removeItem(KEY)
  sessionStorage.removeItem(KEY)
  if (key) (persist ? localStorage : sessionStorage).setItem(KEY, key)
}
export function loadHistory(): Conversation[] {
  try {
    const data = JSON.parse(read(localStorage, HISTORY) || '[]')
    if (!Array.isArray(data)) return []
    return data.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages)).map(c => ({ ...c, messages: c.messages.map((m: Conversation['messages'][number]) => m.status === 'pending' ? { ...m, status: 'interrupted', error: '上次请求已中断；不会自动重试。' } : m) }))
  } catch { return [] }
}
export function saveHistory(history: Conversation[]) { localStorage.setItem(HISTORY, JSON.stringify(history)) }
export function clearConfig() { localStorage.removeItem(CONFIG); saveKey('', false) }
