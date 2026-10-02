import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30s — blockchain calls can be slow
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================
// REQUEST INTERCEPTOR
// Adds auth token to every request
// ============================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('nectartrace_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================
// RESPONSE INTERCEPTOR
// Handles 401 (auth expired) and normalizes errors
// ============================================

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 — token expired or invalid
    if (error.response?.status === 401) {
      localStorage.removeItem('nectartrace_token');
      localStorage.removeItem('nectartrace_user');
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    // Normalize error shape
    const message =
      error.response?.data?.message ||
      error.message ||
      'Something went wrong';

    return Promise.reject(new Error(message));
  }
);

export default api;

// ============================================
// API ENDPOINTS
// ============================================

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateMe: (data) => api.put('/auth/me', data),
};

export const batchesApi = {
  list: (params) => api.get('/batches', { params }),
  get: (batchId) => api.get(`/batches/${batchId}`),
  verify: (batchId) => api.get(`/batches/${batchId}/verify`),
  create: (data) => api.post('/batches', data),
  myBatches: () => api.get('/batches/my'),
  updateStatus: (batchId, status) =>
    api.put(`/batches/${batchId}/status`, { status }),
};

export const listingsApi = {
  list: (params) => api.get('/listings', { params }),
  get: (id) => api.get(`/listings/${id}`),
  create: (data) => api.post('/listings', data),
  update: (id, data) => api.put(`/listings/${id}`, data),
};

export const ordersApi = {
  create: (data) => api.post('/orders', data),
  list: () => api.get('/orders'),
  get: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, status) =>
    api.put(`/orders/${id}/status`, { status }),
};

export const pricesApi = {
  current: () => api.get('/prices/current'),
  history: (days) => api.get('/prices/history', { params: { days } }),
};

export const cooperativesApi = {
  list: () => api.get('/cooperatives'),
  get: (id) => api.get(`/cooperatives/${id}`),
  stats: (id) => api.get(`/cooperatives/${id}/stats`),
  create: (data) => api.post('/cooperatives', data),
};