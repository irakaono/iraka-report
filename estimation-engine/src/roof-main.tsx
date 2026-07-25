// 甍AI Roof Studio エントリ（standalone・Roof Engine 検証用）。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RoofStudio from './components/RoofStudio';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoofStudio />
  </StrictMode>,
);
