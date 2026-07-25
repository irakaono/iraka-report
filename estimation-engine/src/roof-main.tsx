// 甍AI v1.0 エントリ。入口(図面ドロップ) → 積算(Studio) を通す StudioApp を起点にする。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StudioApp from './components/StudioApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioApp />
  </StrictMode>,
);
