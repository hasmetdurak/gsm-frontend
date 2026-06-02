# GSM Frontend

GSM (Global Scalable Matrix) projesinin istemci arayuzu. Bu repo, **gsm-backend** ile eszamanli calisan minimal, framework'suz bir statik SPA'dir.

## Mimari Konum

```
┌──────────────────────┐        ┌──────────────────────┐
│  gsm-frontend (bu)   │  -->   │  gsm-backend (Go)    │
│  app.gsm.app         │  HTTPS │  api.gsm.app         │
│  (Nginx + statik)    │        │  (REST API + OAuth)  │
└──────────────────────┘        └──────────────────────┘
```

Iki repo **ayri Dokploy application** olarak host edilir, Traefik subdomain bazli yonlendirme yapar.

## Dosya Yapisi

```
gsm-frontend/
├── index.html              # SPA markup (compiled CSS, landing + dashboard)
├── app.js                  # Vanilla JS — auth detection, fetch, dashboard logic
├── src/
│   └── input.css           # Tailwind source + custom design system
├── dist/                   # Build output (generated, not committed)
│   ├── styles.css          # Compiled, minified Tailwind bundle
│   └── config.js           # Build-time API base / version / env
├── nginx.conf              # Hardened static server (CSP, gzip, cache, SPA fallback)
├── tailwind.config.js      # Tailwind theme (colors, animations, fonts)
├── postcss.config.js       # PostCSS pipeline (autoprefixer)
├── scripts/
│   └── build-config.js     # Emits dist/config.js from env vars
├── package.json            # Build tooling
├── Dockerfile              # Multi-stage: node:22-alpine → nginx:1.27-alpine
├── .dockerignore
├── .github/workflows/deploy.yml
└── README.md
```

## Backend ile Kontrat

| Endpoint | Method | Aciklama |
|---|---|---|
| `/api/status` | GET | Sistem saglik kontrolu — frontend auth tespiti icin de kullanilir |
| `/api/events` | GET | Son matrix eventleri (auth zorunlu) |
| `/api/publish` | POST | Manuel event yayinla (auth zorunlu) |
| `/api/mcp/sheets` | POST | Google Sheets MCP (auth + quota) |
| `/api/mcp/gmail` | POST | Gmail MCP (auth + quota) |
| `/api/mcp/docs` | POST | Google Docs MCP (auth + quota) |
| `/auth/google/login` | GET | OAuth baslat |
| `/auth/google/callback` | GET | OAuth donus (sadece backend) |

Butun cagrilarda `credentials: 'include'` zorunludur (cross-subdomain cookie).

**Auth tespiti:** Frontend artik `document.cookie` yerine `/api/status` HTTP status koduna (200 vs 401/403) guvenir. Boylece backend `HttpOnly` cookie kullansa bile calisir.

## Build (CI/CD)

Dockerfile iki asamalidir:

1. **Builder stage** (`node:22-alpine`): `npm ci` → `npm run build` → `dist/styles.css` + `dist/config.js` uretilir.
2. **Runtime stage** (`nginx:1.27-alpine`): Sadece HTML + JS + derlenmis CSS servis edilir.

Build sirasinda API base URL enjekte edilmek istenirse:

```bash
docker build --build-arg API_BASE=https://api.gsm.app -t gsm-frontend .
```

Aksi halde frontend kendi origin'ini kullanir (single-host deploy icin).

## Lokal Gelistirme

Statik dosyalari acmak icin:

```bash
# 1) Build (Tailwind compile)
npm install
npm run build

# 2) Serve
npx http-server . -p 3000 -c-1
# veya
python -m http.server 3000
```

Canli CSS izlemek icin iki terminal:

```bash
# Terminal A
npm run watch:css

# Terminal B
npx http-server . -p 3000 -c-1
```

Sonra `http://localhost:3000`. `dist/config.js` bos API base ile uretilir → fetch'ler ayni origin'e duser; **backend**'i lokal calistirip CORS icin `FRONTEND_URL=http://localhost:3000` ayarlamalisin.

## Docker ile Lokal Test

```bash
docker build -t gsm-frontend:dev .
docker run --rm -p 8081:80 gsm-frontend:dev
# http://localhost:8081
# Smoke: curl -fsS http://localhost:8081/healthz
```

## Deploy (Dokploy)

1. GitHub'da `hasmetdurak/gsm-frontend` reposu olustur
2. Pushla: `git init && git remote add origin ... && git push -u origin main`
3. Dokploy'da yeni **Application**:
   - Build type: **Dockerfile**
   - Repo: `hasmetdurak/gsm-frontend`
   - Branch: `main`
   - Domain: `app.gsm.app`
   - Port: `80`
   - Healthcheck: `/healthz`
4. Build arguman olarak `API_BASE=https://api.gsm.app` set et (cross-subdomain icin).
5. (Opsiyonel) GitHub Actions `DOKPLOY_WEBHOOK_URL_FRONTEND` secret'i ile otomatik webhook deploy.

## Guvenlik Notlari

- **CSP** nginx.conf'ta kilitli (`default-src 'self'`, harici kaynaklar whitelist'li).
- **HSTS**: Traefik/Dokploy tarafinda ekleyin (frontend HTTPS aldikta Strict-Transport-Security header'i).
- **Cookie**: Backend `HttpOnly; Secure; SameSite=Lax; Domain=.gsm.app` kullanmali; frontend `document.cookie` yerine HTTP status kontrol eder.
- **XSS**: Event render `textContent` ile DOM'a yazilir, `innerHTML` kullanilmaz.

## Backend ile Eszamanli Versiyonlama

Breaking API degisikliklerinde her iki repoya eszamanli release/PR acilmalidir.
