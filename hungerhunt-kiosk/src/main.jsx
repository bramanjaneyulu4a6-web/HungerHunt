import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './index.css'
import './ui.css'
import './error-feedback.css'
// Last, so the till can override the shared component layer without editing
// files the other two frontends build from.
import './kiosk.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
