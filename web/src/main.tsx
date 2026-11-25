import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/noto-sans-tc/400.css';
import '@fontsource/noto-sans-tc/500.css';
import '@fontsource/noto-sans-tc/700.css';
import './styles/global.css';
import './i18n';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
