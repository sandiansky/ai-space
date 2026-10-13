import { useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Eye, EyeOff, KeyRound, LoaderCircle, Monitor, Moon, Plus, RefreshCw, Settings2, ShieldCheck, Sun, Trash2, Wifi } from 'lucide-react'
import type { Adapter, Category, Config, Model } from './types'
import { errorMessage, getModels, normalizeBase } from './api'
import { adapterLabels, forCategory, mergeModels } from './models'
import { clearConfig, initialConfig } from './storage'
import { Modal } from './components'

const categoryLabels: Record<Category, string> = { chat: '聊天', generate: '图片生成', edit: '图片编辑' }
export function Settings({ config, apiKey, persist, onConfig, onKey, notify }: { config: Config; apiKey: string; persist: boolean; onConfig: (c: Config) => void; onKey: (key: string, persist: boolean) => void; notify: (s: string) => void }) {
  const [keyDraft, setKeyDraft] = useState(apiKey), [baseDraft, setBaseDraft] = useState(config.baseUrl), [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null), [confirm, setConfirm] = useState<'persist' | 'clear' | null>(null)
  const [customId, setCustomId] = useState(''), [customAdapter, setCustomAdapter] = useState<Adapter>('chat'), [modelSearch, setModelSearch] = useState('')
  const lock = useRef(false)
  const save = () => {
    try { const baseUrl = normalizeBase(baseDraft); onConfig({ ...config, baseUrl }); onKey(keyDraft.trim(), persist); notify('API 配置已保存。密钥不会写入项目文件。'); return baseUrl } catch (e) { setStatus({ ok: false, text: errorMessage(e) }); return null }
  }
  const connect = async (fetchList: boolean) => {
    if (lock.current) return
    const baseUrl = save(); if (!baseUrl) return
    if (!keyDraft.trim()) { setStatus({ ok: false, text: '请先输入 API Key。' }); return }
    lock.current = true; setBusy(true); setStatus(null)
    try {
      const ids = await getModels({ baseUrl, key: keyDraft }, new AbortController().signal)
      if (fetchList) {
        const models = mergeModels(ids, config.models)
        const defaults = { ...config.defaults }
        for (const cat of ['chat', 'generate', 'edit'] as const) { const list = forCategory(models, cat); if (!list.some(m => m.id === defaults[cat])) defaults[cat] = list[0]?.id || '' }
        onConfig({ ...config, baseUrl, models, defaults })
      }
      setStatus({ ok: true, text: `连接成功，当前令牌返回 ${ids.length} 个模型${fetchList ? '，列表已更新' : ''}。具体模型能否调用仍需实际验证。` })
    } catch (e) { setStatus({ ok: false, text: errorMessage(e) }) }
    finally { lock.current = false; setBusy(false) }
  }
  const setModelAdapter = (id: string, adapter: Adapter | '') => {
    const categories: Category[] = !adapter ? [] : ['chat', 'reasoning', 'o1'].includes(adapter) ? ['chat'] : ['generate', 'edit']
    const models = config.models.map(m => m.id === id ? { ...m, adapter, categories, source: 'custom' as const } : m)
    const defaults = { ...config.defaults }
    for (const cat of ['chat', 'generate', 'edit'] as const) if (!forCategory(models, cat).some(m => m.id === defaults[cat])) defaults[cat] = forCategory(models, cat)[0]?.id || ''
    onConfig({ ...config, models, defaults })
  }
  const addModel = () => {
    const id = customId.trim()
    if (!id || /[\s\x00-\x1f]/.test(id) || id.length > 150) { notify('请输入有效的模型 ID，不要填写密钥或空格。'); return }
    if (id.startsWith('sk-') || (keyDraft && id.includes(keyDraft))) { notify('模型 ID 不能填写 API Key。'); return }
    if (config.models.some(m => m.id === id)) { notify('该模型已经在列表中，可直接调整适配器。'); return }
    const categories: Category[] = ['chat', 'reasoning', 'o1'].includes(customAdapter) ? ['chat'] : ['generate', 'edit']
    const model: Model = { id, adapter: customAdapter, categories, source: 'custom' }
    const defaults = { ...config.defaults }; for (const cat of categories) if (!defaults[cat]) defaults[cat] = id
    onConfig({ ...config, models: [...config.models, model], defaults }); setCustomId(''); notify('自定义模型已添加。请确认模型支持所选协议。')
  }
  const filtered = config.models.filter(m => m.id.toLowerCase().includes(modelSearch.toLowerCase()))
  return <section className="settings-page scroll-page"><header className="page-header"><div className="header-title"><Settings2 size={19} /><span>设置</span><span className="header-divider" /><span className="header-subtitle">你的空间，你来定义</span></div></header><div className="settings-content"><div className="section-intro"><div className="eyebrow">MAKE YOURSELF AT HOME</div><h1>连接无限可能。</h1><p>带上你的 API Key，让喜欢的 AI 在这里相遇。</p></div>
    <div className="settings-card"><div className="settings-card-heading"><span className="setting-icon blue"><KeyRound size={21} /></span><div><h2>API 连接</h2><p>使用 GPT.GE · V-API 服务</p></div><a className="icon-button" href="https://gpt.ge/" target="_blank" rel="noopener noreferrer" aria-label="打开 GPT.GE"><ArrowUpRight size={18} /></a></div><div className="settings-card-body"><label className="field" htmlFor="base-url"><span>API Base URL</span><input id="base-url" type="url" autoCapitalize="none" spellCheck={false} value={baseDraft} onChange={e => { setBaseDraft(e.target.value); setStatus(null) }} placeholder="https://api.gpt.ge/v1" /></label><label className="field" htmlFor="api-key"><span>API Key</span><div className="password-field"><input id="api-key" type={visible ? 'text' : 'password'} value={keyDraft} onChange={e => { setKeyDraft(e.target.value); setStatus(null) }} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="输入你的 API Key" /><button className="icon-button" aria-label={visible ? '隐藏密钥' : '显示密钥'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><div className="security-note"><ShieldCheck size={17} /><p>密钥默认仅存于当前浏览器会话。<span>会话关闭后可能需要重新输入；请求直接发送至你配置的 API 地址。</span></p></div><label className="toggle-row"><span><strong>在此设备记住密钥</strong><small>仅在你信任的私人设备上开启</small></span><input className="switch" type="checkbox" checked={persist} onChange={e => { if (e.target.checked) setConfirm('persist'); else { onKey(keyDraft.trim(), false); notify('已关闭持久保存，密钥仅保留在当前会话。') } }} /></label><div className="button-row api-buttons"><button className="button secondary" disabled={busy} onClick={() => save()}>保存配置</button><button className="button secondary" disabled={busy} onClick={() => void connect(false)}>{busy ? <LoaderCircle size={16} className="spin" /> : <Wifi size={16} />}测试连接</button><button className="button primary" disabled={busy} onClick={() => void connect(true)}>{busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}获取模型</button></div>{status && <div className={status.ok ? 'inline-success' : 'inline-error'} role="status">{status.ok && <Check size={15} />}{status.text}</div>}
      <details className="cors-details"><summary>跨域检查与连接说明<ChevronDown size={14} /></summary><p>2026-10-13 实测：从 GitHub Pages 来源发起请求，Chrome 155 与 WebKit 27.2 均能读到无效测试令牌的 401 响应。此结果验证了该测试环境的浏览器跨域连通性。另已使用临时有效令牌验证模型列表、gpt-6.1-sol 流式聊天及 gpt-image-2.5-sunburst 生成与单图编辑。</p><p>四个接口的 OPTIONS 响应允许请求头仅为 *，未显式列出 Authorization。浏览器规范要求显式允许 Authorization，建议服务商修正这一兼容性风险。GitHub Pages 无法修改 API 的跨域规则。</p><p>请在最终部署域名、实际手机和自己的令牌上点击“测试连接”。测试仅调用 GET /models；具体图片与聊天模型需要分别验证。无法连接时不会模拟成功，也不会自动重试。</p><a href="https://api-gpt-ge.apifox.cn/" target="_blank" rel="noopener noreferrer">查看官方 API 文档<ArrowUpRight size={13} /></a></details>
    </div></div>
    <div className="settings-card"><div className="settings-card-heading"><span className="setting-icon purple"><Settings2 size={21} /></span><div><h2>模型管理</h2><p>{config.models.length ? `${config.models.length} 个模型 · 按能力选择适配器` : '先获取令牌当前支持的模型'}</p></div></div><div className="settings-card-body"><div className="default-models">{(['chat', 'generate', 'edit'] as const).map(cat => <label className="field" key={cat}><span>默认{categoryLabels[cat]}模型</span><select value={config.defaults[cat]} onChange={e => onConfig({ ...config, defaults: { ...config.defaults, [cat]: e.target.value } })}><option value="">尚未选择</option>{forCategory(config.models, cat).map(m => <option key={m.id} value={m.id}>{m.id}</option>)}</select></label>)}</div><details className="model-details"><summary>可用模型与分类 <span>{config.models.length}<ChevronDown size={14} /></span></summary>{config.models.length > 0 && <><input className="search-input" placeholder="搜索模型 ID…" aria-label="搜索模型" value={modelSearch} onChange={e => setModelSearch(e.target.value)} /><div className="model-list">{filtered.map(m => <div className="model-row" key={m.id}><div><strong>{m.id}</strong><span>{m.categories.length ? m.categories.map(c => categoryLabels[c]).join(' / ') : '待确认能力 · 未自动启用'}{m.source === 'custom' ? ' · 手动配置' : ''}</span></div><select aria-label={`${m.id} 适配器`} value={m.adapter} onChange={e => setModelAdapter(m.id, e.target.value as Adapter | '')}><option value="">暂不启用</option>{Object.entries(adapterLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div>)}{!filtered.length && <p className="hint">没有匹配的模型。</p>}</div></>}<p className="hint">模型列表只表示令牌可见性，不提供完整能力信息。未知模型默认不启用；请选择符合官方文档的适配器。图片适配器支持 GPT Image 与 Nano Banana 系列。</p></details>
    <details className="model-details custom-model"><summary>手动添加自定义模型<Plus size={16} /></summary><div className="custom-form"><label className="field"><span>完整模型 ID</span><input value={customId} onChange={e => setCustomId(e.target.value)} autoCapitalize="none" spellCheck={false} placeholder="从服务商文档复制模型 ID" maxLength={150} /></label><label className="field"><span>请求适配器</span><select value={customAdapter} onChange={e => setCustomAdapter(e.target.value as Adapter)}>{Object.entries(adapterLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><button className="button secondary" onClick={addModel}><Plus size={16} />添加模型</button></div></details>
    </div></div>
    <div className="settings-card"><div className="settings-card-heading"><span className="setting-icon peach"><Sun size={21} /></span><div><h2>偏好设置</h2><p>用你舒服的方式，与 AI 相处</p></div></div><div className="settings-card-body"><div className="preference-row"><span><strong>外观</strong><small>浅色、深色或跟随设备</small></span><div className="segmented theme-switch">{([{ id: 'light', label: '浅色', icon: Sun }, { id: 'dark', label: '深色', icon: Moon }, { id: 'system', label: '自动', icon: Monitor }] as const).map(({ id, label, icon: Icon }) => <button className={config.theme === id ? 'selected' : ''} key={id} onClick={() => onConfig({ ...config, theme: id })}><Icon size={15} /><span>{label}</span></button>)}</div></div><label className="toggle-row"><span><strong>流式回答</strong><small>让文字逐步出现；o1 自动使用非流式</small></span><input className="switch" type="checkbox" checked={config.stream} onChange={e => onConfig({ ...config, stream: e.target.checked })} /></label><div className="install-note"><Plus size={18} /><div><strong>把 AI Space 放到桌面</strong><p>iPhone：Safari 分享 → 添加到主屏幕。<br />Android：Chrome 菜单 → 安装应用或添加到主屏幕。</p></div></div></div></div>
    <button className="text-button danger clear-api" onClick={() => setConfirm('clear')}><Trash2 size={15} />清除 API 配置</button><div className="settings-footer"><span className="brand-mini">✦ AI Space</span><p>一个只属于你的 AI 空间。</p><span>无账号 · 无数据库 · 本机保存历史</span></div>
    </div>{confirm && <Modal title={confirm === 'persist' ? '在本机保存密钥？' : '清除 API 配置？'} onClose={() => setConfirm(null)}><p className="modal-copy">{confirm === 'persist' ? '密钥会以明文保存在此浏览器的 localStorage 中。同源脚本、浏览器扩展或能访问此设备的人可能读取它。请勿在共享设备开启；可随时关闭。' : '会删除当前会话和本机保存的密钥、模型与 API 设置。聊天历史仍会保留。正在进行的请求不会被撤回。'}</p><div className="button-row"><button className="button secondary" onClick={() => setConfirm(null)}>取消</button><button className="button primary" onClick={() => { if (confirm === 'persist') onKey(keyDraft.trim(), true); else { try { clearConfig() } catch { notify('部分存储无法清除，请通过浏览器清理本站数据。') } onKey('', false); onConfig(initialConfig); setKeyDraft(''); setBaseDraft(initialConfig.baseUrl); setStatus(null) } setConfirm(null) }}>{confirm === 'persist' ? '了解风险并保存' : '确认清除'}</button></div></Modal>}</section>
  }
