# Live server update checklist

Use this after you **merge dev -> main** and are ready to deploy to the live server.

---

## Important: do not use dev compose on live

- `docker-compose.yml` is for development (frontend runs `npm run dev` on port `5173`).
- For live server, use `docker-compose.prod.yml` so frontend is built and served as static files.
- This avoids HTTPS mixed-content and WebSocket errors on live domain.

---

## 1. On the live server

1. **Pull latest main**
   ```bash
   cd /path/to/p7erp_local
   git fetch origin
   git checkout main
   git pull origin main
   ```

2. **Set production env (.env in repo root)**
   ```env
   POSTGRES_USER=p7erp
   POSTGRES_PASSWORD=change-this
   POSTGRES_DB=p7erp
   JWT_SECRET=change-this-to-a-long-random-secret
   TENANT_STRATEGY=header
   CORS_ORIGINS=https://prime7erp.com
   VITE_API_BASE_URL=
   ```
   Notes:
   - Keep `VITE_API_BASE_URL` empty (`""`) when frontend and backend are on same domain and frontend proxies `/api`.
   - If backend is on separate domain, set full HTTPS URL (example: `https://api.prime7erp.com`).

3. **Start or update production containers**
   ```bash
   docker compose -f docker-compose.prod.yml down
   docker compose -f docker-compose.prod.yml up --build -d
   ```

4. **Run database migration (safe after deploy)**
   ```bash
   docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
   ```

5. **Quick health check**
   - API: `http://SERVER_IP/health` (or via domain path if proxied)
   - App: open `https://prime7erp.com`

---

## 2. Non-Docker production (manual)

1. Restart backend service (uvicorn/gunicorn/systemd).
2. Rebuild frontend:
   - `cd frontend`
   - `npm ci`
   - `npm run build`
3. Serve `frontend/dist/` via Nginx (or another web server), not `npm run dev`.

---

## 3. Quick reference

| Step | Production Docker command |
|---|---|
| Pull code | `git checkout main && git pull origin main` |
| Start/update stack | `docker compose -f docker-compose.prod.yml up --build -d` |
| Run migrations | `docker compose -f docker-compose.prod.yml exec backend alembic upgrade head` |
| Stop stack | `docker compose -f docker-compose.prod.yml down` |
