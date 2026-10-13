import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, ChevronRight, Expand, Image as ImageIcon, Images as ImagesIcon, LoaderCircle, Plus, SlidersHorizontal, Sparkles, Upload, WandSparkles, X } from 'lucide-react'
import type { Config, ImageResult } from './types'
import { editImage, errorMessage, generateImage } from './api'
import { forCategory, gptImageSizes, ratios, referenceLimit } from './models'
import { Modal, ModelSelect } from './components'

interface Reference { file: File; src: string }
interface CachedResult extends ImageResult { blob?: Blob; display: string; original?: string }
export function Images({ config, apiKey, onSettings, notify }: { config: Config; apiKey: string; onSettings: () => void; notify: (s: string) => void }) {
  const [mode, setMode] = useState<'edit' | 'generate'>('edit'), [modelId, setModelId] = useState(''), [refs, setRefs] = useState<Reference[]>([])
  const [prompt, setPrompt] = useState(''), [ratio, setRatio] = useState('1:1'), [resolution, setResolution] = useState('1K')
  const [busy, setBusy] = useState(false), [validating, setValidating] = useState(false), [error, setError] = useState(''), [results, setResults] = useState<CachedResult[]>([])
  const [elapsed, setElapsed] = useState(0), [preview, setPreview] = useState<string | null>(null), [compare, setCompare] = useState(50), [compareMode, setCompareMode] = useState<'slider' | 'side'>('slider')
  const [saveBusy, setSaveBusy] = useState<number | null>(null), [resultInfo, setResultInfo] = useState('')
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null), lock = useRef(false), urls = useRef(new Set<string>())
  const category = mode === 'edit' ? 'edit' : 'generate', models = forCategory(config.models, category), model = models.find(m => m.id === modelId)
  const maxReferences = referenceLimit(model), isGptImage = model?.adapter === 'gpt-image'
  useEffect(() => { setRatio(model?.adapter === 'gpt-image' ? '1024x1024' : '1:1') }, [model?.adapter])
  const ownUrl = (blob: Blob) => { const url = URL.createObjectURL(blob); urls.current.add(url); return url }
  useEffect(() => { setModelId(models.find(m => m.id === config.defaults[category])?.id || models[0]?.id || '') }, [config.models, config.defaults, category])
  useEffect(() => { if (busy) { const start = Date.now(); setElapsed(0); const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000); return () => clearInterval(timer) } }, [busy])
  useEffect(() => () => { controller.current?.abort(); urls.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  const releaseUrl = (url: string | undefined) => { if (url && urls.current.has(url)) { URL.revokeObjectURL(url); urls.current.delete(url) } }
  const removeReference = (reference: Reference) => {
    if (!results.some(r => r.original === reference.src)) releaseUrl(reference.src)
    setRefs(old => old.filter(r => r.src !== reference.src))
  }
  const addFiles = async (files: File[]) => {
    if (validating || lock.current) return
    setValidating(true); setError('')
    const accepted: Reference[] = []
    try {
      if (refs.length + files.length > maxReferences) throw new Error('当前模型最多选择 ' + maxReferences + ' 张参考图，请减少后重新选择。')
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。HEIC 请先在相册中导出为 JPG。')
        if (file.size > 20 * 1024 * 1024) throw new Error('单张图片请控制在 20 MB 内（本站上传保护限制）。')
        const src = ownUrl(file), img = new Image()
        // Register handlers before setting src; WebKit can reject decode() while a blob is loading.
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('图片无法读取，请重新导出或选择另一张图片。'))
          img.src = src
        }).catch(error => { URL.revokeObjectURL(src); urls.current.delete(src); throw error })
        if (img.naturalWidth * img.naturalHeight > 50000000) { URL.revokeObjectURL(src); urls.current.delete(src); throw new Error('图片像素过大，请缩小至 5000 万像素以内。') }
        accepted.push({ file, src })
      }
      setRefs(old => [...old, ...accepted])
    } catch (e) { accepted.forEach(r => { URL.revokeObjectURL(r.src); urls.current.delete(r.src) }); setError(e instanceof Error ? e.message : '无法读取图片。') }
    finally { setValidating(false); if (input.current) input.current.value = '' }
  }
  const cacheImage = async (image: ImageResult): Promise<CachedResult> => {
    try {
      const r = await fetch(image.src, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) })
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      if (!blob.type.startsWith('image/')) throw new Error()
      return { ...image, blob, display: ownUrl(blob) }
    } catch { return { ...image, display: image.src } }
  }
  const run = async () => {
    if (lock.current || validating) return
    if (!apiKey || !model) { onSettings(); notify('请先填写密钥并获取图片模型。'); return }
    if (!prompt.trim()) { setError('先描述你想要的画面或修改效果。'); return }
    if (mode === 'edit' && !refs.length) { setError('图片编辑需要至少一张参考图。'); return }
    results.forEach(image => { releaseUrl(image.display); if (!refs.some(r => r.src === image.original)) releaseUrl(image.original) })
    lock.current = true; setBusy(true); setError(''); setResults([]); setResultInfo('')
    controller.current = new AbortController()
    const original = mode === 'edit' ? refs[0].src : undefined
    try {
      const c = { baseUrl: config.baseUrl, key: apiKey }
      const output = mode === 'edit'
        ? await editImage(c, model, prompt.trim(), ratio, resolution, refs.map(r => r.file), controller.current.signal)
        : await generateImage(c, model, prompt.trim(), ratio, resolution, controller.current.signal)
      // Display immediately; local caching does not block delivery or trigger another paid request.
      setResults(output.map(image => ({ ...image, display: image.src, original })))
      setResultInfo(`${mode === 'edit' ? '图片编辑' : '图片生成'} · ${model.id}`)
      await Promise.all(output.map(async (image, index) => {
        const cached = await cacheImage(image)
        setResults(old => old.map((item, i) => i === index ? { ...cached, original } : item))
      }))
    } catch (e) { setError(errorMessage(e)) }
    finally { lock.current = false; setBusy(false); controller.current = null }
  }
  const save = async (image: CachedResult, index: number) => {
    if (saveBusy !== null) return
    setSaveBusy(index)
    try {
      if (!image.blob) { setPreview(image.display); notify('图片服务器限制下载。请打开大图后长按保存，链接可能很快失效。'); return }
      const extension = image.blob.type.includes('jpeg') ? 'jpg' : image.blob.type.includes('webp') ? 'webp' : 'png'
      const file = new File([image.blob], `ai-space-${Date.now()}.${extension}`, { type: image.blob.type })
      if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) { await navigator.share({ files: [file], title: 'AI Space' }); return }
      const a = document.createElement('a'); a.href = image.display; a.download = file.name; document.body.appendChild(a); a.click(); a.remove()
      notify('已发起下载。iPhone 可在“文件”中打开图片并存储到相册。')
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) { setPreview(image.display); notify('请打开大图后长按保存图片。') } }
    finally { setSaveBusy(null) }
  }
  return <section className="images-page scroll-page">
    <header className="page-header"><div className="header-title"><ImageIcon size={19} /><span>图片工作台</span><span className="header-divider" /><span className="header-subtitle">把想象变成画面</span></div><span className="header-tag">CREATIVE STUDIO</span></header>
    <div className="studio-content">
      <div className="section-intro"><div className="eyebrow">MAKE SOMETHING YOURS</div><h1>让画面，如你所想。</h1><p>修饰一张照片，或创造一幅从未见过的画面。</p></div>
      <div className="segmented mode-tabs" aria-label="图片处理模式"><button className={mode === 'edit' ? 'selected' : ''} onClick={() => { setMode('edit'); setError('') }} disabled={busy}><WandSparkles size={17} />图片编辑</button><button className={mode === 'generate' ? 'selected' : ''} onClick={() => { setMode('generate'); setError('') }} disabled={busy}><Sparkles size={17} />图片生成</button></div>
      <div className="studio-grid"><div className="studio-controls">
        <div className="panel">
          <div className="panel-heading"><span className="step-number">01</span><h2>{mode === 'edit' ? '选择参考图片' : '描述你的画面'}</h2>{mode === 'edit' && <span className="subtle">{refs.length} / {maxReferences}</span>}</div>
          {mode === 'edit' && <><input type="file" ref={input} hidden accept="image/png,image/jpeg,image/webp" multiple={maxReferences > 1} aria-label="选择参考图片" onChange={e => void addFiles(Array.from(e.target.files || []))} /><button className="upload-zone" disabled={busy || validating || refs.length >= maxReferences} onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) void addFiles(Array.from(e.dataTransfer.files)) }}><span className="upload-icon">{validating ? <LoaderCircle size={24} className="spin" /> : <Plus size={26} strokeWidth={1.4} />}</span><strong>{validating ? '正在读取图片…' : '添加你的照片'}</strong><span>从相册或文件中选择<ChevronRight size={12} /></span><small>JPG、PNG、WebP · 每张不超过 20 MB</small></button>{refs.length > 0 && <div className="reference-grid">{refs.map((ref, i) => <div className="reference" key={ref.src}><button className="reference-preview" aria-label={`查看参考图 ${i + 1}`} onClick={() => setPreview(ref.src)}><img src={ref.src} alt={`参考图 ${i + 1}`} /></button><span>{i === 0 ? '对比原图' : `参考 ${i + 1}`}</span><button className="remove-reference" aria-label={`移除参考图 ${i + 1}`} disabled={busy} onClick={() => removeReference(ref)}><X size={12} /></button></div>)}</div>}</>}
          {mode === 'generate' && <p className="panel-description">从一句描述开始，越具体，越接近你的想象。</p>}
          <label className="field-label" htmlFor="image-prompt">{mode === 'edit' ? '你想怎么修改？' : '图片提示词'}</label><textarea id="image-prompt" className="prompt-input" rows={4} maxLength={16000} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder={mode === 'edit' ? '例如：保留人物和构图，把背景换成海边日落，色调温暖自然…' : '例如：一间阳光洒落的日式咖啡馆，木质桌面上一杯拿铁，胶片摄影，柔和光线…'} />
          <div className="prompt-chips">{(mode === 'edit' ? ['自然提亮', '胶片氛围', '更换背景'] : ['极简摄影', '水彩插画', '电影感']).map(s => <button key={s} disabled={busy} onClick={() => setPrompt(p => `${p}${p ? '，' : ''}${s}`)}>{s}<Plus size={11} /></button>)}</div>
        </div>
        <div className="panel settings-panel"><div className="panel-heading"><span className="step-number">02</span><h2>创作设置</h2><SlidersHorizontal size={16} className="subtle" /></div><label className="field-label">{mode === 'edit' ? '编辑模型' : '生成模型'}</label><ModelSelect models={config.models} category={category} value={modelId} onChange={setModelId} disabled={busy} />{!models.length && <button className="text-button" onClick={onSettings}>前往设置获取模型<ArrowUpRight size={14} /></button>}<div className="field-row"><label className="field"><span>{isGptImage ? '图片尺寸' : '画面比例'}</span><select value={ratio} onChange={e => setRatio(e.target.value)} disabled={busy}>{(isGptImage ? gptImageSizes : ratios).map(r => <option key={r} value={r}>{r}</option>)}</select></label>{model?.adapter === 'banana-pro' && <label className="field"><span>分辨率</span><select value={resolution} onChange={e => setResolution(e.target.value)} disabled={busy}><option>1K</option><option>2K</option><option>4K</option></select></label>}</div><p className="hint">{isGptImage ? 'GPT Image · 当前已验证 1 张参考图。请求尺寸为 1024×1024，实际输出尺寸以服务商返回为准。' : 'Nano Banana 系列 · 编辑支持 1–6 张参考图。'}实际可用性取决于令牌分组。</p></div>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <button className="button primary create-button" disabled={busy || validating || !prompt.trim() || (mode === 'edit' && !refs.length)} onClick={() => void run()}>{busy ? <><LoaderCircle size={18} className="spin" />等待图片 · {elapsed}s</> : <><WandSparkles size={18} />{mode === 'edit' ? '开始编辑' : '生成图片'}<ArrowUpRight size={17} /></>}</button>
        {busy ? <button className="text-button centered" onClick={() => controller.current?.abort()}>停止等待（可能仍会计费）</button> : <p className="cost-note">每次创作会消耗 API 额度，请确认后提交。</p>}
      </div>
      <div className="studio-output">
        <div className="output-header"><h2>创作结果</h2><span>{results.length ? <><Check size={13} />已返回 {results.length} 张图片</> : '你的下一幅作品'}</span></div>
        {!results.length ? <div className={`output-empty ${busy ? 'processing' : ''}`}><div className="empty-art"><div className="art-frame frame-back" /><div className="art-frame frame-front"><ImageIcon size={42} strokeWidth={1} /><span /><span /></div><div className="art-spark"><Sparkles size={21} strokeWidth={1.5} /></div></div><h3>{busy ? '正在等待你的画面' : '好画面，从一个想法开始'}</h3><p>{busy ? '图片创作通常需要一些时间。\n离开此页面后，请求仍会继续。' : mode === 'edit' ? '选择照片，告诉 AI 你的想法。\n处理完成后，在这里查看与对比。' : '写下画面描述，点击生成。\n真实创作结果会出现在这里。'}</p><span className="output-foot">{busy ? <><LoaderCircle size={13} className="spin" />请保持页面开启</> : <><ImagesIcon size={14} />仅展示接口返回的图片</>}</span></div> : <div className="result-list"><p className="result-info">{resultInfo}</p>{results.map((image, i) => <div className="result-card" key={`${resultInfo}-${i}`}>
          {image.original && <div className="result-toolbar"><span>原图与效果对比</span><div className="segmented compact"><button className={compareMode === 'slider' ? 'selected' : ''} onClick={() => setCompareMode('slider')}>滑动</button><button className={compareMode === 'side' ? 'selected' : ''} onClick={() => setCompareMode('side')}>并排</button></div></div>}
          {image.original && compareMode === 'side' ? <div className="side-compare"><button onClick={() => setPreview(image.original!)}><img src={image.original} alt="编辑前原图" /><span>原图</span></button><button onClick={() => setPreview(image.display)}><img src={image.display} alt="AI 编辑后的图片" onError={() => notify('图片无法加载，链接可能已经失效。请检查网络。')} /><span>效果</span></button></div> : image.original ? <div className="compare-view"><img className="compare-base" src={image.display} alt="AI 编辑后的图片" /><div className="compare-original" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}><img src={image.original} alt="编辑前原图" /></div><span className="image-label original-label">原图</span><span className="image-label result-label">效果</span><div className="compare-line" style={{ left: `${compare}%` }}><span>‹ ›</span></div><input aria-label="拖动比较原图和效果" type="range" min="0" max="100" value={compare} onChange={e => setCompare(Number(e.target.value))} /></div> : <button className="generated-preview" onClick={() => setPreview(image.display)}><img src={image.display} alt="AI 生成的图片" onError={() => notify('图片链接无法加载或已失效。')} /></button>}
          <div className="result-actions"><button className="button secondary" onClick={() => setPreview(image.display)}><Expand size={16} />查看大图</button><button className="button primary" disabled={saveBusy !== null} onClick={() => void save(image, i)}><ArrowDownToLine size={16} />{saveBusy === i ? '保存中…' : '保存图片'}</button></div>{image.revisedPrompt && <details><summary>查看优化后的提示词</summary><p>{image.revisedPrompt}</p></details>}
        </div>)}<div className="save-note"><Upload size={16} /><p>记得保存喜欢的作品。<span>图片仅在当前页面保留；远程链接可能数小时内失效。</span></p></div></div>}
      </div></div>
    </div>
    {preview && <Modal title="图片预览" onClose={() => setPreview(null)}><img className="full-preview" src={preview} alt="图片大图预览" /><p className="hint">手机可长按图片保存。若无法保存，请返回使用“保存图片”。</p><a className="text-button" href={preview} target="_blank" rel="noopener noreferrer">在新窗口查看<ArrowUpRight size={14} /></a></Modal>}
  </section>
}
