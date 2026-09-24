import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './demo/demo.css'
import './index.css'
import '@icon-park/react/styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
