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
├── index.html       # SPA markup (Tailwind CDN, landing + dashboard)
├── app.js           # Vanilla JS - cookie auth, fetch, dashboard logic
├── index.css        # Custom dark/glassmorphism design system
├── nginx.conf       # Statik sunucu konfigurasyonu
├── Dockerfile       # nginx:1.27-alpine tabanli imaj
└── .github/workflows/deploy.yml
```

## Backend ile Kontrat

| Endpoint | Method | Aciklama |
|---|---|---|
| `/api/status` | GET | Sistem saglik kontrolu (anonim) |
| `/api/events` | GET | Son 100 matrix eventi (kimlik dogrulama gerekebilir) |
| `/api/publish` | POST | Manuel event yayinla (kimlik dogrulama gerekebilir) |
| `/api/mcp/sheets` | POST | Google Sheets MCP (auth + quota) |
| `/api/mcp/gmail` | POST | Gmail MCP (auth + quota) |
| `/api/mcp/docs` | POST | Google Docs MCP (auth + quota) |
| `/auth/google/login` | GET | OAuth baslat |
| `/auth/google/callback` | GET | OAuth donus (sadece backend) |

Butun cagrilarda `credentials: 'include` zorunludur (cross-subdomain cookie).

## Lokal Gelistirme

Sadece statik dosyalari acmak icin:

```bash
npx http-server . -p 3000
# veya
python -m http.server 3000
```

Sonra `http://localhost:3000` uzerinden API_BASE `http://localhost:8080` olur (CORS icin backend tarafinda `FRONTEND_URL=http://localhost:3000` ayarlanmis olmali).

## Docker ile Lokal Test

```bash
docker build -t gsm-frontend:dev .
docker run --rm -p 8081:80 gsm-frontend:dev
# http://localhost:8081
```

## Deploy (Dokploy)

1. GitHub'da `hasmetdurak/gsm-frontend` reposu olustur
2. Bu klasoru pushla: `git init && git remote add origin ... && git push -u origin main`
3. Dokploy'da yeni **Application** olustur:
   - Build type: **Dockerfile**
   - Repo: `hasmetdurak/gsm-frontend`
   - Branch: `main`
   - Domain: `app.gsm.app`
   - Port: `80`
4. (Opsiyonel) GitHub Actions `DOKPLOY_WEBHOOK_URL_FRONTEND` secret'i ile otomatik deploy

## Backend ile Eszamanli Versiyonlama

Breaking API degisikliklerinde her iki repoya eszamanli release/PR acilmalidir.
