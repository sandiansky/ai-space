import { useEffect, useRef, type ReactNode } from 'react'
import { Check, ChevronDown, Copy, X } from 'lucide-react'
import type { Category, Model } from './types'
import { forCategory } from './models'
import { useState } from 'react'

export function ModelSelect({ models, category, value, onChange, disabled = false }: { models: Model[]; category: Category; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const list = forCategory(models, category)
  return <div className="model-select"><span className="model-dot" /><select aria-label={category === 'chat' ? '聊天模型' : category === 'edit' ? '图片编辑模型' : '图片生成模型'} value={value} onChange={e => onChange(e.target.value)} disabled={disabled || !list.length}><option value="" disabled>{list.length ? '选择模型' : '尚未配置模型'}</option>{list.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}</select><ChevronDown size={14} /></div>
}
export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false)
  useEffect(() => { if (copied) { const id = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(id) } }, [copied])
  return <button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false) } catch { setFailed(true) } }} aria-label={label}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制' : failed ? '请长按文字复制' : label}</button>
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close() }, [])
  return <dialog ref={dialog} className="modal" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="modal-head"><h2>{title}</h2><button autoFocus className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></div>{children}</dialog>
}
