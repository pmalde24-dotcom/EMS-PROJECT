# EMS — કંપની-સ્તરીય Employee Management System

React + Vite (frontend) અને Node + Express + MongoDB (backend) વડે બનેલી **સંપૂર્ણ કાર્યકારી** EMS — 25+ મોડ્યુલ,
6-રોલ RBAC, ગુજરાતી UI.

---

## 🚀 ઝડપી શરૂઆત (Quick Start)

### જરૂરિયાત
- **Node.js 18+** (20 સૂચવેલું) અને npm
- MongoDB — ત્રણમાંથી કોઈ એક:
  1. **MongoDB Atlas** (સૌથી સરળ, ક્લાઉડ) — connection string `server/.env` ના `MONGODB_URI` માં મૂકો
  2. **સ્થાનિક MongoDB** — `MONGODB_URI=mongodb://127.0.0.1:27017/ems`
  3. **કંઈ નહીં!** — `MONGODB_URI` ખાલી રાખો → in-memory MongoDB ઑટોમેટિક ચાલુ થશે અને ડેમો ડેટા સીડ થશે
     *(પહેલી વાર mongod બાઈનરી ~100MB ડાઉનલોડ થાય; ઇન્ટરનેટ જોઈએ)*

### 1) Backend
```bash
cd server
npm install
cp .env.example .env        # પછી .env ખોલીને MONGODB_URI / JWT secrets ગોઠવો
npm run seed -- --force     # ડેમો ડેટા (40 કર્મચારી, પગાર રન, રજા, સંપત્તિ…)
npm run dev                 # અથવા npm start  → http://localhost:4000
```
✔️ Atlas વાપરો તો પહેલાં: `npm run db:check` (કનેક્શન ચકાસે) · `npm run db:sync-counters` (ID counters તાજા કરે)

### 2) Frontend (નવી ટર્મિનલમાં)
```bash
cd client
npm install
npm run dev                 # → http://localhost:5173
```

### 3) લોગિન કરો
| રોલ | ઈમેલ | પાસવર્ડ |
|---|---|---|
| Super Admin | `superadmin@company.com` | `SuperAdmin@123` |
| HR Admin | `kavita.nair@acmetech.example.com` | `Password@123` |
| HR Manager | `rakesh.trivedi@acmetech.example.com` | `Password@123` |
| Dept Manager | `vikram.shah@acmetech.example.com` | `Password@123` |
| Team Leader | `pooja.joshi@acmetech.example.com` | `Password@123` |
| Employee | `ananya.sharma@acmetech.example.com` | `Password@123` |

---

## 🧪 ટેસ્ટ કમાન્ડ (server/ માંથી)

| કમાન્ડ | શું ચકાસે |
|---|---|
| `npm run test:e2e` | આખો બિઝનેસ ફ્લો: કર્મચારી→લોગિન→હાજરી→રજા→બે-સ્તર મંજૂરી→પગાર રન→પે-સ્લિપ PDF→ઓડિટ (29 ચેક) |
| `npm run test:modules` | Assets · Performance · Offboarding ની આખી લાઇફસાઇકલ (32 ચેક) |
| `npm run test:surface` | UI ખરેખર વાપરે છે તે 128 endpoints (128 ચેક) |
| `npm run db:check` | Atlas/DB કનેક્ટિવિટી + કલેક્શન counts |
| `npm run db:setup` | db:check + seed (એક જ કમાન્ડમાં) |
| `npm run db:sync-counters` | કર્મચારી/સંપત્તિ ID counters ↔ હાલનો ડેટા સિંક |

> નવો પગાર મહિનો ટેસ્ટ કરવો હોય: `PAYROLL_MONTH=11 npm run test:e2e`

---

## 📁 સ્ટ્રક્ચર
```
ems/
├── server/                 # Node + Express API
│   ├── src/
│   │   ├── config/         # env, constants (roles/permissions), db
│   │   ├── models/         # 39 Mongoose models (indexes, enums, soft-delete)
│   │   ├── middleware/     # auth (JWT + RBAC + scope), validate (Zod), error, rate-limit
│   │   ├── routes/         # 29 routers — બધા મોડ્યુલના REST endpoints
│   │   ├── utils/          # audit, pdf, csv, upload, mailer, notify, sequence, permissions…
│   │   └── seed/           # ડેમો ડેટા સીડર
│   ├── scripts/            # e2e-flow, module-lifecycle, smoke-ui-surface, db-check, sync-counters
│   └── uploads/            # લોકલ ફાઇલ સ્ટોરેજ (Cloudinary વગર)
├── package.json            # root build/start — એક-સર્વિસ deploy
├── render.yaml             # Render Blueprint (Web Service)
├── Dockerfile              # એક-કન્ટેનર deploy (node:20-slim)
└── client/                 # React + Vite + Tailwind (ગુજરાતી UI)
    └── src/
        ├── api/            # axios client + બધા endpoints
        ├── components/     # UI kit, AppLayout, ProtectedRoute
        ├── context/        # Auth (RBAC), Theme (dark/light)
        ├── hooks/          # useList (pagination/search), useDebounce
        └── pages/          # 62 પેજ — દરેક મોડ્યુલ માટે list/form/detail/dashboard
```

## 🔐 સુરક્ષા નોંધ
- `.env` **ક્યારેય** Git/public માં ન મૂકો (DB પાસવર્ડ + JWT secrets હોય છે)
- Atlas માં Network Access મર્યાદિત IP રાખો; પાસવર્ડ ફક્ત આ પ્રોજેક્ટ માટે વાપરો
- Payroll/બેંક વિગતો ફક્ત અધિકૃત રોલને દેખાય; બેંક ખાતું હંમેશા માસ્ક્ડ (`XXXXXX1234`)
- પગારના દર/ટેક્સ સ્લેબ કોડમાં હાર્ડકોડ નથી — Settings → Payroll માંથી બદલાય છે

## 🌐 Render પર લાઇવ કરવું (ભલામણ કરેલી રીત — એક જ સર્વિસ)

આ પ્રોજેક્ટ હવે **frontend + backend એક જ URL પર** ચાલે એ રીતે તૈયાર છે — CORS/white-page જેવી ઝંઝટ નહીં.

### પગલાં
1. Render → **New → Web Service** → આ repo પસંદ કરો
2. Settings:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
3. Environment Variables:

| Key | Value | નોંધ |
|---|---|---|
| `NODE_ENV` | `production` | |
| `ALLOW_DEMO_MODE` | `true` | ડેટાબેઝ વગર ટેસ્ટ કરવા (ડેમો ડેટા ઑટો-સીડ). કાયમી ડેટા જોઈએ તો આ હટાવો |
| `MONGODB_URI` | `mongodb+srv://…` | Atlas વાપરવું હોય તો (Atlas → Network Access માં `0.0.0.0/0` ઉમેરવું પડે, કારણ Render નું IP બદલાય છે) |
| `JWT_ACCESS_SECRET` | random 32+ chars | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | random 32+ chars | |
| `COOKIE_SECURE` | `true` | HTTPS પર httpOnly cookies માટે |

4. Deploy થાય પછી → `https://<તમારી-સર્વિસ>.onrender.com` → લોગિન → dashboard. બધું એક જ origin પર. ✅

> `render.yaml` પણ મૂકેલી છે — Render → New → **Blueprint** → repo પસંદ કરો તો આ બધું આપોઆપ ગોઠવાઈ જાય.

### વૈકલ્પિક: બે અલગ સર્વિસ (Static + API)
- **Backend Web Service:** root `server`, Start `node src/server.js`, env: `CLIENT_ORIGIN=https://<frontend>.onrender.com`, `COOKIE_SECURE=true`
- **Frontend Static Site:** root `client`, Build `npm run build`, Publish `dist`, env `VITE_API_URL=https://<backend>.onrender.com`
  *(અથવા rebuild વગર બદલવા `client/public/config.js` ની પહેલી લાઇનમાં URL મૂકી redeploy કરો)*
- **SPA Rewrite (ફરજિયાત!)** Static Site → Redirects/Rewrites → `Source: /*` → `Destination: /index.html` → **Rewrite**
  *(નહીંતર login પછી `/dashboard` ખોલતાં 404 = સફેદ પાનું)*

### 🩺 "લોગિન પછી સફેદ પાનું" — ચેકલિસ્ટ
| લક્ષણ | કારણ | ઉપાય |
|---|---|---|
| Login 200 પછી white, URL `/login` કે `/dashboard` | Static host પર SPA rewrite નથી → deep-link 404 | ઉપરનો Rewrite નિયમ ઉમેરો, **અથવા** એક-સર્વિસ રીત વાપરો |
| લોગિન પેજ પણ ન ખૂલે / ખાલી | `VITE_API_URL` કે `config.js` ખોટું / backend બંધ | `/api/health` સીધું બ્રાઉઝરમાં ખોલી ચકાસો; Render logs જુઓ |
| Backend log: `MONGODB_URI is required` | production + ખાલી URI | `ALLOW_DEMO_MODE=true` સેટ કરો (ડેમો) અથવા `MONGODB_URI` મૂકો |
| API `CORS` error | બે-સર્વિસ + `CLIENT_ORIGIN` ખોટું | બરાબર frontend origin સેટ કરો |
| કંઈપણ બીજું | — | હવે blank white ને બદલે **એરર સ્ક્રીન** દેખાશે જેમાં અસલી મેસેજ લખ્યો હશે (ErrorBoundary) |

## 📦 Production બિલ્ડ (જાતે)
```bash
npm run build                   # root માંથી — client/dist બને (અને બંને deps install થાય)
npm start                       # બંને એક જ પોર્ટ પર → http://localhost:4000
# અથવા બે-સર્વિસ: cd client && npm run build (dist → static host) · cd server && NODE_ENV=production npm start
```
`NODE_ENV=production` માં `MONGODB_URI` ફરજિયાત (અથવા `ALLOW_DEMO_MODE=true`). `Dockerfile` + `render.yaml` પણ સામેલ છે.

---

વિગતવાર સ્ટેટસ રિપોર્ટ: [`PROGRESS.md`](./PROGRESS.md) · સેમ્પલ PDF: `sample-payslip.pdf`, `sample-letter-*.pdf`
