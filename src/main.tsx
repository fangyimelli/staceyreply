import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './ui/AppErrorBoundary';
import '../styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(AppErrorBoundary as any, null, React.createElement(App)),
  ),
);
