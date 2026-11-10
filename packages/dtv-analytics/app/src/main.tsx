import React from 'react';
import ReactDOM from 'react-dom/client';
import { AnalyticsApp } from './AnalyticsApp';
import './app.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <AnalyticsApp />
    </React.StrictMode>,
);
