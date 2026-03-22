
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <SidebarProvider>
          <SettingsProvider>
            <NotificationProvider>
              <AppProvider>
                <App />
              </AppProvider>
            </NotificationProvider>
          </SettingsProvider>
        </SidebarProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
