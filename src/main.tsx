import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PlayingNow } from './components/PlayingNow'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PlayingNow />
  </StrictMode>,
)
