import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

const updateSW = registerSW({ onNeedRefresh() { window.dispatchEvent(new Event('ai-space:update')) } })
window.addEventListener('ai-space:apply-update', () => { void updateSW(true) })
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
