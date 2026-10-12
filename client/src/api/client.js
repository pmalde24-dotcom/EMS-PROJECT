import axios from 'axios';
import { toast } from 'sonner';

/**
 * Single axios instance for the whole app.
 * - Uses a relative base URL so the Vite dev-server proxy (and any reverse
 *   proxy in production) handles the backend connection.
 * - Sends httpOnly cookies (refresh token) and attaches the access token.
 * - Automatically refreshes an expired access token once per request.
 */
/**
 * API ક્યાં છે તે runtime પર નક્કી થાય (Render/deploy માટે):
 *  1. `public/config.js` માં window.__EMS_API_URL__ (rebuild વગર બદલી શકાય)
 *  2. build-time env: VITE_API_URL=https://ems-api.onrender.com
 *  3. ખાલી હોય તો same-origin '/api' (એક જ સર્વિસમાં frontend+backend હોય ત્યારે)
 */
const rawBase = String(
  (typeof window !== 'undefined' && window.__EMS_API_URL__) || import.meta.env.VITE_API_URL || '',
).trim().replace(/\/+$/, '');
const originOnly = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;
export const API_BASE = originOnly ? `${originOnly}/api` : '/api';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken = localStorage.getItem('ems_access_token') || null;
export const setAccessToken = (token) => {
  accessToken = token;
  if (token) localStorage.setItem('ems_access_token', token);
  else localStorage.removeItem('ems_access_token');
};
export const getAccessToken = () => accessToken;

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing = null;
async function refreshAccessToken() {
  if (!refreshing) {
    refreshing = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => { setAccessToken(res.data.data.accessToken); return res.data.data.accessToken; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error;
    const status = response?.status;
    const isAuthCall = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (status === 401 && !config._retried && !isAuthCall) {
      config._retried = true;
      try {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      } catch {
        setAccessToken(null);
        if (!window.location.pathname.startsWith('/login')) {
          toast.error('સેશન સમાપ્ત થઈ ગયું — ફરી લોગિન કરો');
          window.location.href = '/login';
        }
      }
    }

    if (!response) {
      toast.error('સર્વર સાથે સંપર્ક થઈ શક્યો નથી');
    } else if (status === 403) {
      toast.error(response.data?.message || 'આ ક્રિયા માટે પરવાનગી નથી');
    } else if (status === 429) {
      toast.error(response.data?.message || 'ઘણી બધી વિનંતીઓ — થોડી વાર પછી પ્રયાસ કરો');
    } else if (status >= 500) {
      toast.error(response.data?.message || 'સર્વરમાં તકલીફ થઈ');
    }
    return Promise.reject(error);
  }
);

/** Extracts a human-readable error message (also surfaces field errors). */
export const errorMessage = (err) => {
  const data = err?.response?.data;
  if (data?.errors?.length) return data.errors.map((e) => `${e.field}: ${e.message}`).join(' · ');
  return data?.message || err?.message || 'કંઈક ખોટું થયું';
};

export default api;
