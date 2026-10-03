import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PlayingNow } from './components/PlayingNow'
import { captureOwnerKey } from './net/watch'
import { startPwa } from './net/pwa'
import { SiteAnalytics } from './components/SiteAnalytics'
import { HonourToast } from './components/HonourToast'
import { BarkSubtitle } from './components/BarkSubtitle'

captureOwnerKey()
startPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PlayingNow />
    <SiteAnalytics />
    <HonourToast />
    <BarkSubtitle />
  </StrictMode>,
)
