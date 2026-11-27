import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { reportLoadFailure } from './state/loadFailure';
import './styles.css';

// Vite fires this when a lazy chunk's preloads fail (often an older build's file gone after a
// redeploy). The import still rejects, so the part's LoadBoundary shows its message; this makes sure
// the page-wide notice appears where no part can show one.
window.addEventListener('vite:preloadError', () => reportLoadFailure());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
