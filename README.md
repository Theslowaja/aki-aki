# 🎭 Akinator API Middleware

Middleware Express.js yang **aman, berlapis, dan production-ready** untuk [`@aqul/akinator-api`](https://www.npmjs.com/package/@aqul/akinator-api).

---

## 🏗️ Arsitektur Keamanan

```
Request
   │
   ▼
[1] Helmet         — Security headers (CSP, HSTS, XSS, dll)
   │
   ▼
[2] CORS           — Whitelist origin
   │
   ▼
[3] Body Parser    — Limit 10KB (anti payload DoS)
   │
   ▼
[4] Global Rate Limit ── Per IP: 30 req/menit
   │
   ▼
[5] Auth Middleware ── Validasi API Key (SHA-256 hashed)
   │
   ▼
[6] Key Rate Limit ── Per key: 50 req/menit
   │
   ▼
[7] Input Sanitizer ── Deteksi XSS, path traversal, injection
   │
   ▼
[8] Validator ── Type, format, range setiap field
   │
   ▼
[9] Session Limit ── Maks 5 sesi baru/menit per key (endpoint /start)
   │
   ▼
   Route Handler (Akinator)
```

---

## 📦 Instalasi

```bash
git clone <repo>
cd akinator-middleware
npm install
cp .env.example .env
# Edit .env sesuai kebutuhan
```

---

## ⚙️ Konfigurasi (.env)

| Variable | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server |
| `NODE_ENV` | `development` | Environment |
| `MASTER_API_KEY` | — | **Wajib diset!** Key untuk admin |
| `RATE_LIMIT_MAX_REQUESTS` | `30` | Max req/menit per IP |
| `KEY_RATE_LIMIT_MAX` | `50` | Max req/menit per API key |
| `SESSION_RATE_LIMIT_MAX` | `5` | Max sesi baru/menit per key |
| `SESSION_TTL_SECONDS` | `3600` | TTL sesi (1 jam) |
| `MAX_SESSIONS_PER_KEY` | `10` | Maks sesi aktif per key |
| `ALLOWED_ORIGINS` | `*` | Whitelist origin CORS |

---

## 🚀 Menjalankan

```bash
# Development
npm run dev

# Production
NODE_ENV=production npm start
```

---

## 🔑 Manajemen API Key

### 1. Generate key via CLI (direkomendasikan)

```bash
# Mode interaktif
node scripts/generate-key.js

# Mode CLI langsung
node scripts/generate-key.js --label "my-app" --expires 90
```

### 2. Generate key via Admin API

```bash
# Set MASTER_API_KEY di .env terlebih dahulu

# Buat key baru
curl -X POST http://localhost:3000/admin/keys \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "my-app", "expiresInDays": 90}'

# List semua key
curl http://localhost:3000/admin/keys \
  -H "X-Master-Key: YOUR_MASTER_KEY"

# Revoke key
curl -X POST http://localhost:3000/admin/keys/revoke \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "aki_xxx..."}'
```

---

## 📡 API Endpoints

### Autentikasi
Semua endpoint `/api/akinator/*` memerlukan API key di header:
```
X-API-Key: aki_xxxxxxxxxxxx
# atau
Authorization: Bearer aki_xxxxxxxxxxxx
```

---

### `POST /api/akinator/start` — Mulai Game

**Body:**
```json
{
  "language": "en",
  "region": "en",
  "childMode": false
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid-v4",
  "question": {
    "text": "Is your character real?",
    "step": 1,
    "progression": "0.00"
  }
}
```

---

### `POST /api/akinator/answer` — Jawab Pertanyaan

| Answer | Arti |
|---|---|
| `0` | Ya |
| `1` | Tidak |
| `2` | Tidak tahu |
| `3` | Mungkin |
| `4` | Mungkin tidak |

**Body:**
```json
{
  "sessionId": "uuid-v4",
  "answer": 0
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid-v4",
  "question": {
    "text": "Next question...",
    "step": 2,
    "progression": "12.50"
  },
  "shouldGuess": false
}
```

Jika `shouldGuess: true`, panggil `/win`.

---

### `POST /api/akinator/back` — Kembali

**Body:**
```json
{ "sessionId": "uuid-v4" }
```

---

### `POST /api/akinator/win` — Tebak Karakter

**Body:**
```json
{ "sessionId": "uuid-v4" }
```

**Response:**
```json
{
  "success": true,
  "guess": {
    "name": "Pikachu",
    "description": "Fictional character from Pokemon",
    "photo": "https://...",
    "probability": "98.5%"
  }
}
```

---

### `GET /api/akinator/session/:id` — Info Sesi

### `DELETE /api/akinator/session/:id` — Hapus Sesi

---

## 🛡️ Proteksi Spam

| Layer | Mekanisme | Limit |
|---|---|---|
| IP | Global rate limit | 30 req/menit |
| Key | Per-key rate limit | 50 req/menit |
| Session | Create session limit | 5 sesi/menit |
| Session | Max aktif per key | 10 sesi |
| Session | TTL | 1 jam |
| Body | Size limit | 10KB |

Response saat kena limit:
```json
{
  "success": false,
  "error": "TOO_MANY_REQUESTS",
  "message": "Terlalu banyak permintaan...",
  "retryAfterSeconds": 45
}
```

---

## 🔒 Keamanan Tambahan

- **API key tidak disimpan plain-text** — di-hash SHA-256
- **Error message** tidak bocorkan detail internal di production
- **Input sanitizer** deteksi XSS, path traversal, template injection
- **Session isolation** — sesi tidak bisa diakses oleh key lain
- **Auto-cleanup** sesi expired setiap 5 menit
- **Request size** dibatasi 10KB

---

## 📊 Admin Stats

```bash
curl http://localhost:3000/admin/stats \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

```json
{
  "server": {
    "uptime": 3600,
    "environment": "production",
    "memoryMB": "45.23"
  },
  "sessions": {
    "activeSessions": 3,
    "activeKeys": 2
  },
  "keys": {
    "total": 5,
    "active": 4,
    "expired": 1
  }
}
```

---

## 🏭 Tips Production

1. **Aktifkan Redis** (`USE_REDIS=true`) agar rate limit persistent lintas restart
2. **Set `ALLOWED_ORIGINS`** ke domain spesifik, jangan `*`
3. **Gunakan HTTPS** (Nginx/Caddy sebagai reverse proxy)
4. **Set `NODE_ENV=production`** untuk disable debug info di error response
5. **Gunakan PM2** atau Docker untuk process management
6. **Simpan key di database** (PostgreSQL/MongoDB) untuk persistensi

```bash
# Contoh run dengan PM2
pm2 start src/server.js --name akinator-api
```
