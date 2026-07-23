import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './lib/analytics';
import { App } from './App';
import { KitchenSink } from './components/KitchenSink';

// Dev-only component gallery: open /#kitchen-sink to preview per-class primary colors.
const kitchenSink = window.location.hash === '#kitchen-sink';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {kitchenSink ? <KitchenSink /> : <App />}
  </React.StrictMode>,
);
