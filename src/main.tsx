import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Active browser entry for the Vite app: index.html -> /src/main.tsx -> /src/App.tsx.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
