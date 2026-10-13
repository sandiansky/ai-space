import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Image as ImageIcon, MessageCircle, Settings2, Sparkles, X, WifiOff } from 'lucide-react'
import type { Config } from './types'
import { loadConfig, loadKey, saveConfig, saveKey, isPersistent } from './storage'
import { Chat } from './Chat'
import { Images } from './Images'
import { Settings } from './Settings'

type Page = 'chat' | 'images' | 'settings'
const nav = [{ id: 'chat' as const, title: '聊天', icon: MessageCircle }, { id: 'images' as const, title: '图片工作台', icon: ImageIcon }, { id: 'settings' as const, title: '设置', icon: Settings2 }]
function getPage(): Page { const p = location.hash.slice(1); return p === 'images' || p === 'settings' ? p : 'chat' }
export default function App() {
  const [page, setPage] = useState<Page>(getPage), [config, setConfig] = useState(loadConfig), [apiKey, setApiKey] = useState(loadKey)
  const [persist, setPersist] = useState(isPersistent), [notice, setNotice] = useState(''), [online, setOnline] = useState(navigator.onLine), [update, setUpdate] = useState(false)
  const notify = useCallback((message: string) => setNotice(message), [])
  const changeConfig = (next: Config) => { setConfig(next); try { saveConfig(next) } catch { notify('本机存储不可用，设置只在当前页面内有效。') } }
  const changeKey = (key: string, keep: boolean) => {
    setApiKey(key); setPersist(keep)
    try { saveKey(key, keep) } catch { setPersist(false); notify('密钥无法保存；仅在当前页面内有效。请关闭本机持久保存。') }
  }
  useEffect(() => {
    const hash = () => setPage(getPage()), net = () => setOnline(navigator.onLine), sw = () => setUpdate(true)
    window.addEventListener('hashchange', hash); window.addEventListener('online', net); window.addEventListener('offline', net); window.addEventListener('ai-space:update', sw)
    return () => { window.removeEventListener('hashchange', hash); window.removeEventListener('online', net); window.removeEventListener('offline', net); window.removeEventListener('ai-space:update', sw) }
  }, [])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { const dark = config.theme === 'dark' || (config.theme === 'system' && media.matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17191d' : '#f6f7f9') }
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply)
  }, [config.theme])
  useEffect(() => {
    const view = window.visualViewport
    const resize = () => {
      document.documentElement.style.setProperty('--app-height', `${view?.height ?? window.innerHeight}px`)
      document.documentElement.style.setProperty('--app-top', `${view?.offsetTop ?? 0}px`)
      document.documentElement.classList.toggle('keyboard-open', (window.innerHeight - (view?.height ?? window.innerHeight)) > 140)
    }
    resize(); view?.addEventListener('resize', resize); view?.addEventListener('scroll', resize); window.addEventListener('resize', resize)
    return () => { view?.removeEventListener('resize', resize); view?.removeEventListener('scroll', resize); window.removeEventListener('resize', resize) }
  }, [])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer) } }, [notice])
  const navigate = (p: Page) => { location.hash = p; setPage(p) }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#chat" aria-label="AI Space 首页"><span className="brand-icon"><Sparkles size={21} strokeWidth={1.7} /></span><span>AI Space<span className="brand-caption">YOUR PERSONAL AI</span></span></a>
      <div className="sidebar-label">你的空间</div>
      <nav aria-label="主导航">{nav.map(({ id, title, icon: Icon }) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={20} strokeWidth={1.8} /><span>{title}</span>{page === id && <span className="nav-indicator" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="private-card"><span className="tiny-label">A LITTLE SPACE, BIG IDEAS</span><p>想法，从这里开始。</p><span>对话与创作，只属于你。</span><Sparkles size={24} /></div><button className="connection" onClick={() => navigate('settings')}><span className={`status-dot ${apiKey ? 'configured' : ''}`} /><span>{apiKey ? '密钥已配置' : '连接你的 AI'}</span><ArrowUpRight size={15} /></button><div className="sidebar-foot">AI Space <span>个人版 · 1.0</span></div></div>
    </aside>
    <main className="main-area">
      {!online && <div className="offline-banner" role="status"><WifiOff size={15} />当前离线 · 历史记录仍可查看</div>}
      <div className="page-frame" hidden={page !== 'chat'}><Chat config={config} apiKey={apiKey} onSettings={() => navigate('settings')} notify={notify} /></div>
      <div className="page-frame" hidden={page !== 'images'}><Images config={config} apiKey={apiKey} onSettings={() => navigate('settings')} notify={notify} /></div>
      <div className="page-frame" hidden={page !== 'settings'}><Settings config={config} apiKey={apiKey} persist={persist} onConfig={changeConfig} onKey={changeKey} notify={notify} /></div>
    </main>
    <nav className="mobile-nav" aria-label="底部导航">{nav.map(({ id, title, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={22} strokeWidth={page === id ? 2 : 1.7} /><span>{id === 'images' ? '图片' : title}</span></button>)}</nav>
    {notice && <div className="toast" role="status">{notice}<button aria-label="关闭通知" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {update && <div className="update-banner" role="status">新版本已准备好，请完成当前任务后更新。<button onClick={() => window.dispatchEvent(new Event('ai-space:apply-update'))}>更新</button><button aria-label="关闭更新提示" onClick={() => setUpdate(false)}><X size={16} /></button></div>}
  </div>
}
