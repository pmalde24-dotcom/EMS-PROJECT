# 🩹 Render "login પછી સફેદ પાનું" — જૂના પ્રોજેક્ટમાં શું બદલવું (પગલાવાર)

> તમારી પાસેનો જૂનો પ્રોજેક્ટ બદલવાનો છે — આખો નવેસરથી ડાઉનલોડ કરવાની જરૂર **નથી**.
> કુલ **7 ફાઇલોમાં ફેરફાર + 5 નવી ફાઇલો**. સૌથી ઝડપી રીત: સાથે આપેલી **`render-fix.zip`** ની ફાઇલો તમારા પ્રોજેક્ટમાં એ જ folder-path પર કૉપી કરીને જૂની overwrite કરો. (તમે જાતે કંઈ બદલ્યું હોય તો પહેલાં બેકઅપ રાખો.)

## ❓ શું બગ હતું (3 કારણ)

| # | કારણ | અસર |
|---|---|---|
| 1 | Backend થી built frontend serve થતું નહોતું | `/login`, `/dashboard` સીધું ખોલો તો 404 → **સફેદ પાનું** |
| 2 | `client` માં API URL `/api` હાર્ડકોડ | frontend અને backend અલગ સર્વિસ હોય તો API ન મળે → error → પેજ ખાલી |
| 3 | prod માં `MONGODB_URI` વગર સર્વર ચાલુ જ ન થાય | Render પર backend ક્રેશ → બધા API fail → સફેદ/ખાલી |

---

# ભાગ 1 — ફાઇલોમાં ફેરફાર

## 1) `server/src/app.js` — 3 ફેરફાર

**1a) CORS માં wildcard:** શોધો —
```js
if (allowedOrigins.includes(origin)) return cb(null, true);
```
બદલીને લખો —
```js
if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
```

**1b) Render host allowlist:** શોધો —
```js
const isPreview = /\.e2b\.app$/.test(hostname) || /\.arena\.(ai|dev)$/.test(hostname) || hostname.endsWith('.ngrok-free.app');
```
બદલીને લખો —
```js
const isPreview = /\.e2b\.app$/.test(hostname) || /\.arena\.(ai|dev)$/.test(hostname)
  || hostname.endsWith('.ngrok-free.app') || hostname.endsWith('.onrender.com') || hostname.endsWith('.vercel.app');
```

**1c) Frontend serve + deep-link fallback:** શોધો —
```js
/* ── Root + 404 + errors ─────────────────────────────────────────── */
app.get('/', (req, res) => res.json({ success: true, message: 'EMS API', data: { docs: '/api/health', version: '1.0.0' } }));
app.use(notFound);
```
બદલીને લખો —
```js
/* ── Built frontend (single-service deploy: frontend + API એક જ URL પર) ── */
const fs = require('fs');
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');
const spaIndex = path.join(CLIENT_DIST, 'index.html');
const hasSpa = fs.existsSync(spaIndex);
if (hasSpa) {
  app.use(express.static(CLIENT_DIST, {
    index: false,
    maxAge: '7d',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('config.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  // SPA fallback — /login, /dashboard વગેરે બધા client-side રૂટ index.html આપે (404 → સફેદ પાનું નહીં)
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    if (!req.accepts('html')) return next();
    return res.sendFile(spaIndex);
  });
}

/* ── Root + 404 + errors ─────────────────────────────────────────── */
if (!hasSpa) {
  app.get('/', (req, res) => res.json({ success: true, message: 'EMS API', data: { docs: '/api/health', version: '1.0.0' } }));
}
app.use(notFound);
```

## 2) `server/src/config/env.js` — 1 લાઇન ઉમેરો

શોધો — `COOKIE_SECURE: bool(process.env.COOKIE_SECURE, false),`
એની **પછી** આ લાઇન ઉમેરો —
```js
  // production માં પણ in-memory demo mode ની છૂટ (Render free tier જેવા ટેસ્ટ-ડિપ્લોય માટે)
  ALLOW_DEMO_MODE: bool(process.env.ALLOW_DEMO_MODE, false),
```

## 3) `server/src/config/db.js` — 1 બ્લોક બદલો

શોધો —
```js
  if (env.isProd) {
    throw new Error('MONGODB_URI is required in production. Refusing to start without a database.');
  }
```
બદલીને લખો —
```js
  if (env.isProd && !env.ALLOW_DEMO_MODE) {
    throw new Error('MONGODB_URI is required in production. (અથવા ટેસ્ટ-ડિપ્લોય માટે ALLOW_DEMO_MODE=true સેટ કરો.)');
  }
  if (env.isProd) {
    console.warn('⚠️  ALLOW_DEMO_MODE=true → in-memory demo DB વપરાય છે. ડેટા રીસ્ટાર્ટ પર જતો રહે. કાયમી ડેટા માટે MONGODB_URI સેટ કરો.');
  }
```

## 4) `server/src/server.js` — ઑટો-સીડ બ્લોક બદલો

શોધો —
```js
    const userCount = await User.countDocuments({ deletedAt: null });
    if (userCount === 0) {
      if (db.mode === 'memory' && env.SEED.demo) {
        // Zero-setup demo: seed a full sample company into the in-memory database.
        console.log('🌱 Empty database detected — seeding demo data (set MONGODB_URI for persistent data)…');
        const { runSeed } = require('./seed/seed');
        await runSeed({ skipConnect: true });
      } else if (!env.isProd) {
        console.log('ℹ️  No users found. Run `npm run seed` to create the Super Admin and demo data.');
      }
    }
```
બદલીને લખો —
```js
    const userCount = await User.countDocuments({ deletedAt: null });
    if (userCount === 0) {
      if (env.SEED.demo) {
        console.log(`🌱 Empty database detected (${db.mode}) — seeding demo data… (SEED_DEMO_DATA=false થી બંધ કરી શકાય)`);
        const { runSeed } = require('./seed/seed');
        await runSeed({ skipConnect: true });
      } else {
        console.log('ℹ️  No users found and SEED_DEMO_DATA=false — create the first admin with `npm run seed`.');
      }
    }
```

## 5) `client/src/api/client.js` — 2 ફેરફાર

**5a)** શોધો —
```js
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});
```
બદલીને લખો —
```js
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
```

**5b)** શોધો —
```js
    refreshing = axios.post('/api/auth/refresh', {}, { withCredentials: true })
```
બદલીને લખો —
```js
    refreshing = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
```

## 6) `client/index.html` — 1 લાઇન ઉમેરો

શોધો — `<body class="h-full bg-slate-50 dark:bg-slate-950">`
એની **પછી** ઉમેરો —
```html
    <!-- Deploy વખતે API URL બદલવો હોય તો public/config.js માં window.__EMS_API_URL__ સેટ કરો -->
    <script src="/config.js"></script>
```

## 7) `client/src/main.jsx` — 2 ફેરફાર

**7a)** શોધો — `import { AuthProvider } from './context/AuthContext';`
એની **પછી** ઉમેરો —
```jsx
import ErrorBoundary from './components/ErrorBoundary';
```

**7b)** JSX માં wrap કરો — શોધો —
```jsx
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
```
બદલીને —
```jsx
  <React.StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
```
અને શોધો —
```jsx
    </QueryClientProvider>
  </React.StrictMode>,
```
બદલીને —
```jsx
    </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
```

---

# ભાગ 2 — નવી 5-6 ફાઇલો (ZIP માંથી જેમ છે તેમ કૉપી કરો)

| ફાઇલ | શું કરે |
|---|---|
| `client/public/config.js` **નવી** | deploy વખતે API URL rebuild વગર બદલવા |
| `client/src/components/ErrorBoundary.jsx` **નવી** | કોઈપણ JS error → ગુજરાતી એરર સ્ક્રીન (સફેદ નહીં) |
| `package.json` (root) **નવી** | `npm run build` (બંને build) + `npm start` (બંને એક પોર્ટ પર) |
| `render.yaml` **નવી** (વૈકલ્પિક) | Render Blueprint — સેટિંગ આપોઆપ |
| `Dockerfile` + `.dockerignore` **નવી** (વૈકલ્પિક) | કન્ટેનર deploy |

---

# ભાગ 3 — Render પર સેટિંગ બદલવાની

## રીત A (ભલામણ): **એક જ Web Service** — frontend + backend સાથે

1. જૂની **Static Site બંધ/ડિલીટ** કરો (હવે જરૂર નથી)
2. **New → Web Service** → તમારો GitHub repo
3. Setting:

| Setting | Value |
|---|---|
| Root Directory | *(ખાલી — જ્યાં `package.json` બનાવ્યું છે તે root)* |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

4. **Environment Variables:**

| Key | Value | નોંધ |
|---|---|---|
| `NODE_ENV` | `production` | |
| `ALLOW_DEMO_MODE` | `true` | DB વગર ચાલે (ડેમો ડેટા ઑટો-સીડ) |
| `COOKIE_SECURE` | `true` | HTTPS cookies |
| `JWT_ACCESS_SECRET` | random 32+ chars | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | random 32+ chars | |
| `MONGODB_URI` | *(વૈકલ્પિક)* Atlas URI | કાયમી ડેટા જોઈએ તો જ |

5. Deploy — બસ. `https://<સર્વિસ>.onrender.com` પર લોગિન → dashboard. CORS/rewrite નામની કોઈ ઝંઝટ જ નહીં. ✅

## રીત B: **જૂની બે સર્વિસ જ રાખવી** હોય

- **Backend (Web Service)** → Environment માં ઉમેરો:
  `CLIENT_ORIGIN=https://<તમારી-frontend>.onrender.com` · `COOKIE_SECURE=true` · `ALLOW_DEMO_MODE=true` (અથવા `MONGODB_URI`)
- **Frontend (Static Site)** → Environment માં: `VITE_API_URL=https://<તમારી-backend>.onrender.com`
- **અને સૌથી અગત્યનું:** Static Site → **Redirects/Rewrites** → ઉમેરો:
  `Source: /*` → `Destination: /index.html` → **Action: Rewrite** ← આ ન કરો તો ફરી સફેદ પાનું આવશે!

---

# ભાગ 4 — કૉપી કર્યા પછી 3 ચેક (2 મિનિટ)

1. **push → deploy** થવા દો (Render auto-deploy)
2. બ્રાઉઝરમાં ખોલો: `https://<તમારી-સર્વિસ>.onrender.com/api/health` → `{"success":true,...}` દેખાય = backend બરાબર
3. પછી `/login` સીધું ખોલો → લોગિન પેજ દેખાય (404 નહીં) → લોગિન કરો → dashboard આવે = ✅ સફેદ પાનું ગયું!

**હજી કંઈ ખોટું લાગે તો:** Render → સર્વિસ → **Logs** ની છેલ્લી 10-15 લાઇન કૉપી કરીને મને મોકલો — તરત કહી દઈશ ક્યાં અટકે છે.
