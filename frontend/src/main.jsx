import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './lib/queryClient';
import { AuthProvider } from './context/AuthContext';
import App from './App.jsx';
import './index.css';
import { Toaster } from 'react-hot-toast';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#2A2520',
            color: '#F5F0E8',
            border: '1px solid rgba(154, 142, 126, 0.2)',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>
);