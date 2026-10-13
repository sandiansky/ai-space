import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, BookOpen, Check, Clock3, Code2, History, MessageSquarePlus, PenLine, RotateCcw, Sparkles, Square, Trash2, X } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Config, Conversation, Message } from './types'
import { chat, errorMessage } from './api'
import { forCategory } from './models'
import { loadHistory, saveHistory } from './storage'
import { CopyButton, Modal, ModelSelect } from './components'

const starters = [
  { icon: PenLine, color: 'peach', title: '让表达更出色', text: '润色文案，找到恰好的语气', prompt: '帮我润色一段文字，让表达更自然、清晰。请先问我想修改的内容和使用场景。' },
  { icon: BookOpen, color: 'blue', title: '把复杂变简单', text: '拆解知识，听懂一个新概念', prompt: '我想学习一个新概念。请先问我感兴趣的领域，再用通俗的比喻向我解释。' },
  { icon: Code2, color: 'green', title: '一起解决问题', text: '理清思路，找到下一步', prompt: '我遇到了一个问题，想和你一起理清思路。请先问我具体情况，再一步步帮我分析。' },
  { icon: Sparkles, color: 'purple', title: '给灵感一点空间', text: '脑暴想法，探索新的可能', prompt: '陪我做一次创意头脑风暴。请先问我主题和目标，然后帮我探索不同方向。' }
]
export function Chat({ config, apiKey, onSettings, notify }: { config: Config; apiKey: string; onSettings: () => void; notify: (s: string) => void }) {
  const [history, setHistory] = useState(loadHistory), [activeId, setActiveId] = useState<string | null>(null)
  const [modelId, setModelId] = useState(config.defaults.chat), [input, setInput] = useState(''), [busy, setBusy] = useState(false), [drawer, setDrawer] = useState(false), [confirm, setConfirm] = useState<'regenerate' | 'clear' | null>(null)
  const controller = useRef<AbortController | null>(null), lock = useRef(false), scroll = useRef<HTMLDivElement>(null), textarea = useRef<HTMLTextAreaElement>(null), autoscroll = useRef(true)
  const active = history.find(c => c.id === activeId), messages = active?.messages || [], models = forCategory(config.models, 'chat')
  useEffect(() => { if (!models.some(m => m.id === modelId)) setModelId(models.find(m => m.id === config.defaults.chat)?.id || models[0]?.id || '') }, [config.models, config.defaults.chat, modelId])
  useEffect(() => { try { saveHistory(history) } catch { notify('聊天历史无法保存，本机存储可能已满。请清理历史。') } }, [history, notify])
  useEffect(() => { if (messages.length && autoscroll.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }, [history, busy, activeId])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 144)}px` } }, [input])
  const patchMessage = (conversationId: string, messageId: string, patch: Partial<Message>) => setHistory(old => old.map(c => c.id === conversationId ? { ...c, messages: c.messages.map(m => m.id === messageId ? { ...m, ...patch } : m) } : c))
  const send = async (regenerate = false) => {
    if (lock.current) return
    if (!apiKey) { onSettings(); notify('先连接你的 API，再开始对话。'); return }
    const model = models.find(m => m.id === modelId)
    if (!model) { onSettings(); notify('请先获取并选择聊天模型。'); return }
    let context: Message[]
    if (regenerate) {
      const lastUser = messages.findLastIndex(m => m.role === 'user')
      if (lastUser < 0) return
      context = messages.slice(0, lastUser + 1).filter(m => m.role === 'user' || m.status === 'complete')
    } else {
      if (!input.trim()) return
      context = [...messages.filter(m => m.role === 'user' || m.status === 'complete'), { id: crypto.randomUUID(), role: 'user', content: input.trim(), status: 'complete' }]
    }
    const id = activeId || crypto.randomUUID(), reply: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', model: model.id, status: 'pending' }
    const conversation: Conversation = { id, title: active?.title || context[0].content.slice(0, 30), model: model.id, messages: [...context, reply], updated: Date.now() }
    lock.current = true; setBusy(true); autoscroll.current = true
    setHistory(old => [conversation, ...old.filter(c => c.id !== id)]); setActiveId(id); if (!regenerate) setInput('')
    controller.current = new AbortController()
    try {
      await chat({ baseUrl: config.baseUrl, key: apiKey }, model, context, config.stream, controller.current.signal, content => patchMessage(id, reply.id, { content }))
      patchMessage(id, reply.id, { status: 'complete' })
    } catch (error) { patchMessage(id, reply.id, { status: 'interrupted', error: errorMessage(error) }) }
    finally { lock.current = false; setBusy(false); controller.current = null }
  }
  const newChat = () => { if (busy) return; setActiveId(null); setInput(''); setDrawer(false); setModelId(config.defaults.chat || models[0]?.id || '') }
  return <section className="chat-page">
    <header className="page-header"><div className="header-title"><MessageSquarePlus size={19} /><span>AI 对话</span><span className="header-divider" /><span className="header-subtitle">让好想法发生</span></div><div className="header-actions"><button className="icon-button" aria-label="聊天历史" onClick={() => setDrawer(true)}><History size={20} /></button><button className="icon-button" aria-label="新建对话" onClick={newChat} disabled={busy}><MessageSquarePlus size={20} /></button></div></header>
    <div className="chat-model-row"><ModelSelect models={config.models} category="chat" value={modelId} disabled={busy} onChange={id => { setModelId(id); if (activeId) setHistory(old => old.map(c => c.id === activeId ? { ...c, model: id } : c)) }} /><span className="subtle"><span className="small-dot" />私人对话</span></div>
    <div className="chat-scroll" ref={scroll} onScroll={() => { if (scroll.current) autoscroll.current = scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 100 }}>
      {!messages.length ? <div className="welcome">
        <div className="welcome-mark"><Sparkles size={38} strokeWidth={1.25} /><span className="orbit-dot" /></div>
        <div className="eyebrow">A SPACE FOR YOUR MIND</div><h1>今天，想聊点什么？</h1><p className="welcome-copy">一个问题，一点灵感，或一个还没成形的想法。<br />在这里，慢慢展开。</p>
        {!apiKey && <button className="setup-pill" onClick={onSettings}><span className="status-dot" />连接 API，开启你的空间<ArrowUpRight size={15} /></button>}
        <div className="starter-grid">{starters.map(({ icon: Icon, color, title, text, prompt }) => <button key={title} className="starter-card" onClick={() => { setInput(prompt); textarea.current?.focus() }}><span className={`starter-icon ${color}`}><Icon size={20} strokeWidth={1.7} /></span><strong>{title}</strong><span>{text}</span><ArrowUpRight size={16} className="card-arrow" /></button>)}</div>
        <div className="local-note"><Check size={13} />聊天记录仅保存在此设备</div>
      </div> : <div className="messages">{messages.map((m, i) => <article key={m.id} className={`message ${m.role}`}><div className="message-label">{m.role === 'assistant' ? <><span className="assistant-mark"><Sparkles size={13} /></span><span>AI Space</span><small>{m.model}</small></> : <span>你</span>}</div><div className="message-content">{m.role === 'user' ? <p>{m.content}</p> : m.content ? <Markdown remarkPlugins={[remarkGfm]} components={{ pre: ({ children }) => <div className="code-wrap"><pre>{children}</pre></div>, code: ({ children, className, ...props }) => className ? <><div className="code-heading"><span>{className.replace('language-', '')}</span><CopyButton text={String(children)} label="复制代码" /></div><code className={className} {...props}>{children}</code></> : <code {...props}>{children}</code>, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt }) => <span>[外部图片：{alt || '已省略'}]</span> }}>{m.content}</Markdown> : m.status === 'pending' ? <div className="typing" aria-label="等待回答"><i /><i /><i /></div> : <p className="subtle">未收到回答</p>}</div>{m.error && <div className="inline-error" role="alert">{m.error}</div>}{m.role === 'assistant' && m.status !== 'pending' && <div className="message-tools">{m.content && <CopyButton text={m.content} label="复制回答" />}{i === messages.length - 1 && <button className="text-button" disabled={busy} onClick={() => setConfirm('regenerate')}><RotateCcw size={15} />重新生成</button>}{m.status === 'interrupted' && <span className="subtle">未完成</span>}</div>}</article>)}</div>}
    </div>
    <div className="composer-area"><form className="composer" onSubmit={e => { e.preventDefault(); void send() }}><textarea ref={textarea} rows={1} maxLength={32000} value={input} onChange={e => setInput(e.target.value)} placeholder="把想法放在这里…" aria-label="聊天消息" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(min-width: 768px) and (pointer: fine)').matches) { e.preventDefault(); void send() } }} /><div className="composer-bottom"><span>{busy ? '正在回答…' : '随时开始，慢慢聊'}{input.length > 28000 && ` · ${input.length}/32000`}</span>{busy ? <button type="button" className="send-button stop" aria-label="停止回答" onClick={() => controller.current?.abort()}><Square size={14} fill="currentColor" /></button> : <button type="submit" className="send-button" aria-label="发送消息" disabled={!input.trim()}><ArrowUp size={20} /></button>}</div></form><p className="composer-note">AI 也可能出错，重要信息请核实。<span>Shift + Enter 换行</span></p></div>
    {drawer && <Modal title="你的对话" onClose={() => setDrawer(false)}><button className="button primary full" disabled={busy} onClick={newChat}><MessageSquarePlus size={17} />开启新对话</button><div className="history-list">{history.length ? history.map(c => <div className="history-row" key={c.id}><button disabled={busy} className={activeId === c.id ? 'selected' : ''} onClick={() => { setActiveId(c.id); setModelId(c.model); setDrawer(false); autoscroll.current = true }}><strong>{c.title}</strong><span><Clock3 size={12} />{new Date(c.updated).toLocaleDateString('zh-CN')} · {c.messages.length} 条消息</span></button><button className="icon-button" aria-label={`删除对话 ${c.title}`} disabled={busy} onClick={() => { setHistory(old => old.filter(x => x.id !== c.id)); if (activeId === c.id) setActiveId(null) }}><Trash2 size={16} /></button></div>) : <div className="empty-small">还没有对话。从一个想法开始吧。</div>}</div>{history.length > 0 && <button className="text-button danger" disabled={busy} onClick={() => setConfirm('clear')}><Trash2 size={15} />清空全部聊天历史</button>}</Modal>}
    {confirm && <Modal title={confirm === 'regenerate' ? '重新生成这条回答？' : '清空全部聊天历史？'} onClose={() => setConfirm(null)}><p className="modal-copy">{confirm === 'regenerate' ? '这会用当前模型重新发起一次请求，可能再次计费，并替换上一条回答。' : '此操作无法撤销。对话记录将从当前设备删除。'}</p><div className="button-row"><button className="button secondary" onClick={() => setConfirm(null)}><X size={16} />取消</button><button className="button primary" onClick={() => { const action = confirm; setConfirm(null); if (action === 'regenerate') void send(true); else { setHistory([]); setActiveId(null) } }}>{confirm === 'regenerate' ? '确认重新生成' : '确认清空'}</button></div></Modal>}
  </section>
}
