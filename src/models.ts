import type { Adapter, Category, Model } from './types'
// Only documented image families are enabled automatically. /models supplies availability, not capabilities.
export function inferModel(id: string): Pick<Model, 'adapter' | 'categories'> {
  if (/^(gpt-image-1(?:\.5)?|gpt-image-2\.5-sunburst)$/i.test(id)) return { adapter: 'gpt-image', categories: ['generate', 'edit'] }
  if (/^(nano-banana-pro-(2k|4k))$/i.test(id)) return { adapter: 'banana-fixed', categories: ['generate', 'edit'] }
  if (/^(nano-banana-pro|gemini-3-pro-image-preview)$/i.test(id)) return { adapter: 'banana-pro', categories: ['generate', 'edit'] }
  if (/^(nano-banana|gemini-2\.5-flash-image)$/i.test(id)) return { adapter: 'banana', categories: ['generate', 'edit'] }
  if (/image|imagen|dall-e|flux|seedream|banana|tts|audio|whisper|embed|rerank|video|sora|veo|kling|midjourney/i.test(id)) return { adapter: '', categories: [] }
  if (/^o1(?:-|$)/i.test(id)) return { adapter: 'o1', categories: ['chat'] }
  if (/^o[34](?:-|$)|^gpt-[56](?:[.-]|$)/i.test(id)) return { adapter: 'reasoning', categories: ['chat'] }
  if (/^(gpt-|chatgpt-|claude-|gemini-|glm-|chatglm-|deepseek-|qwen-|grok-)/i.test(id)) return { adapter: 'chat', categories: ['chat'] }
  return { adapter: '', categories: [] }
}
export function mergeModels(ids: string[], existing: Model[]): Model[] {
  const custom = existing.filter(m => m.source === 'custom')
  return [...custom, ...[...new Set(ids)].filter(id => !custom.some(m => m.id === id)).map(id => ({ id, ...inferModel(id), source: 'api' as const }))]
}
export function forCategory(models: Model[], category: Category) { return models.filter(m => m.adapter && m.categories.includes(category)) }
export const adapterLabels: Record<Adapter, string> = {
  chat: '通用聊天 · 流式', reasoning: '推理聊天 · 无温度参数', o1: 'o1 · 非流式',
  banana: 'Nano Banana · 比例尺寸', 'banana-pro': 'Nano Banana Pro · 分辨率 + 比例', 'banana-fixed': 'Nano Banana Pro 2K/4K · 比例尺寸',
  'gpt-image': 'GPT Image · 像素尺寸'
}
export const ratios = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9']
// Only expose the size exercised against the selected relay alias.
export const gptImageSizes = ['1024x1024']
export const preferredDefaults = { chat: 'gpt-6.1-sol', generate: 'gpt-image-2.5-sunburst', edit: 'gpt-image-2.5-sunburst' }
// Keep a conservative single-reference limit until the exact relay alias is verified with multiple files.
export function referenceLimit(model?: Model) { return model?.adapter === 'gpt-image' ? 1 : 6 }
