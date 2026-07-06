# GitHub Actions Setup

This project includes two GitHub Actions workflows:

## 1. CI Workflow (`.github/workflows/ci.yml`)

Runs on every push to `main`/`develop` and on pull requests.

### Jobs

**Backend Tests**
- Sets up PostgreSQL and Redis services
- Installs Python dependencies
- Runs linting and pytest tests
- Requires `GEMINI_ENABLED=false` and `OLLAMA_ENABLED=false` to skip AI service calls

**Frontend Tests**
- Sets up Node.js 20
- Installs dependencies with `npm ci`
- Runs linting and type checking
- Builds the frontend bundle

**Docker Build**
- Validates backend and frontend Dockerfile syntax
- Builds images using Docker Buildx with GitHub Actions cache
- Does not push (cache only)

**Docker Compose Validation**
- Validates `docker-compose.yml` and `docker-compose.prod.yml` syntax

### Environment Variables

The CI workflow automatically:
- Disables AI providers (Gemini, Ollama, vLLM) to avoid API calls
- Sets test database credentials
- Uses `VITE_API_BASE_URL=http://localhost:8000` for frontend build

## 2. Deploy Workflow (`.github/workflows/deploy.yml`)

Triggered on push to `main` or when a tag is pushed (e.g., `v1.0.0`).

### Jobs

**Build and Push**
- Builds backend and frontend Docker images
- Pushes to GitHub Container Registry (`ghcr.io`)
- Auto-tags images with branch name, semantic version, and commit SHA

**Deploy** (runs only on tag)
- SSH into production server
- Pulls latest compose files
- Pulls updated images
- Runs `docker compose up -d` 
- Runs Alembic migrations

### Prerequisites

To use the deploy workflow, set these secrets in your GitHub repo:

1. **DEPLOY_HOST** – Production server IP/domain (e.g. `188.245.156.127`)
2. **DEPLOY_USER** – SSH login user; use **`root`** on prime7erp.com (docker runs as `primeadmin` via `sudo` in the workflow)
3. **DEPLOY_PATH** – App directory on the server (e.g. `/home/primeadmin/p7erp_local`)
4. **DEPLOY_SSH_KEY** – Private SSH key for `DEPLOY_USER`
5. **VITE_API_BASE_URL** – Frontend API URL baked at build time (production domain)
6. **DOCKERHUB_TOKEN** – Docker Hub push token

Re-deploy without a new tag: GitHub → Actions → **Deploy** → **Run workflow** → enter tag (e.g. `v1.7.1`).

**Optional:** Set up a deploy key on the production server instead of password auth:
```bash
# On your local machine
ssh-keygen -t ed25519 -f deploy_key -N ""

# Copy public key to server
ssh-copy-id -i deploy_key.pub user@server

# Add private key to GitHub Secrets as DEPLOY_SSH_KEY
cat deploy_key
```

## Docker Best Practices Included

✓ **Multi-stage frontend builds** – Node.js → Nginx  
✓ **Buildx with layer caching** – Speeds up rebuilds  
✓ **GitHub Actions cache** – Persists build layers between runs  
✓ **Service containers** – PostgreSQL, Redis for tests  
✓ **Parallel jobs** – Backend, frontend, and Docker build run simultaneously  
✓ **Compose validation** – Catches syntax errors early  

## Local Testing

Test the workflows locally with [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or: curl https://raw.githubusercontent.com/nektos/act/master/install.sh | bash

# Run CI workflow
act -j backend-test

# Run all jobs
act
```

## Troubleshooting

**Tests fail on first run:**  
- Backend: May timeout waiting for Postgres. Increase `health-retries` or `health-timeout` in `ci.yml`.
- Frontend: If `npm ci` fails, check `package-lock.json` is committed.

**Docker build fails:**  
- Check that Dockerfiles don't reference files outside their context (backend build needs `backend/`).
- For frontend: Ensure `Dockerfile.prod` exists and `nginx.prod.conf` is present.

**Deploy fails:**  
- SSH key must have newlines preserved. Use `echo -e "..."` in GitHub secrets if needed.
- Ensure app directory exists on server: `ssh user@host mkdir -p /path/to/app`
- Production server must have Docker and Docker Compose installed.

## Next Steps

1. **Commit workflows** to git: `git add .github/workflows/ && git commit -m "Add GitHub Actions CI/CD"`
2. **Enable Actions** in repo settings if not already enabled
3. **For CI only:** Push to your default branch and watch **Actions** tab for results
4. **For deployment:** 
   - Add secrets to your GitHub repo settings
   - Test with a tag: `git tag v0.1.0 && git push origin v0.1.0`
5. **Monitor logs** in the Actions tab; click a failed job for details
