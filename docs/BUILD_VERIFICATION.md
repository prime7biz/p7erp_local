# P7 ERP – Build verification

Checklist for B1–B3. Run from repo root: `p7erp_local`.

**PowerShell:** Use `;` to chain commands (e.g. `cd frontend; npm run build`). Do not use `&&`.

## B1 – Backend build

```powershell
cd backend
python -m pip install -r requirements.txt
```

(Use `py -m pip` if `python` is not in PATH on Windows.)

**Success:** No pip errors. Then run `uvicorn app.main:app --reload` to confirm the app starts.

## B2 – Env and config

1. Copy `.env.example` to `.env` in the repo root. Set `DATABASE_URL` and `JWT_SECRET`. Optionally set `CORS_ORIGINS=http://localhost:5173` for local frontend.
2. Ensure PostgreSQL is running; create the DB if needed. From `backend/`: `alembic upgrade head`.
3. Copy `frontend/.env.example` to `frontend/.env`. Set `VITE_API_BASE_URL=http://localhost:8000`.

**Success:** Backend starts without config errors; frontend can call the API when both are running.

## B3 – Frontend build

```powershell
cd frontend
npm install
npm run build
```

**Success:** No TypeScript or Vite errors; `frontend/dist/` is produced.

## Quick reference

| Step | Command |
|------|---------|
| Backend deps | `cd backend` then `python -m pip install -r requirements.txt` |
| Migrations | `cd backend` then `alembic upgrade head` |
| Backend run | `cd backend` then `uvicorn app.main:app --reload` |
| Frontend build | `cd frontend` then `npm install` then `npm run build` |
| Frontend dev | `cd frontend` then `npm run dev` |

## Sign-off

- [ ] B1 – Backend dependencies install; uvicorn starts the app.
- [ ] B2 – `.env` in place; migrations run; backend starts.
- [ ] B3 – `npm run build` succeeds.
