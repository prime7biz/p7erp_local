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

Triggered on push to `main` or when a `v*` tag is pushed.

### Job: Build and Push

- Builds backend and frontend Docker images
- Pushes to Docker Hub (`prime7biz/p7erp-backend`, `prime7biz/p7erp-frontend`)
- Tags: `latest` plus branch/tag name (`main` or `vX.Y.Z`)
- **Does not SSH to the live server** — production updates are manual

### Live server (manual)

After images are on Docker Hub, SSH to the server and run:

```bash
cd /home/primeadmin/p7erp_local
git pull --ff-only origin main
DEPLOY_PATH=/home/primeadmin/p7erp_local bash scripts/deploy_production_remote.sh vX.Y.Z
```

### Prerequisites (GitHub secrets for image build)

1. **DOCKERHUB_TOKEN** – Docker Hub push token
2. **VITE_API_BASE_URL** – Frontend API URL baked at build time (production domain)

Optional for manual server deploy (not stored in GitHub workflow): SSH access to `root@` your server and path `/home/primeadmin/p7erp_local`.

**Optional:** Set up a deploy key on the production server for manual SSH:
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

**Image build fails:**  
- Check Docker Hub token (`DOCKERHUB_TOKEN`) and `VITE_API_BASE_URL` secret.
- Check that Dockerfiles don't reference files outside their context (backend build needs `backend/`).
- For frontend: Ensure `Dockerfile.prod` exists and `nginx.prod.conf` is present.

**Live server not updated after tag:**  
- Expected — GitHub only builds images. SSH to the server and run `scripts/deploy_production_remote.sh vX.Y.Z` (see `docs/DEPLOYMENT_PROCESS.md`).

## Next Steps

1. **Commit workflows** to git: `git add .github/workflows/ && git commit -m "Add GitHub Actions CI/CD"`
2. **Enable Actions** in repo settings if not already enabled
3. **For CI only:** Push to your default branch and watch **Actions** tab for results
4. **For deployment:** 
   - Add `DOCKERHUB_TOKEN` and `VITE_API_BASE_URL` to GitHub secrets
   - Tag a release: `git tag v0.1.0 && git push origin v0.1.0` (builds images only)
   - Manually SSH to production when ready: `scripts/deploy_production_remote.sh v0.1.0`
5. **Monitor logs** in the Actions tab; click a failed job for details
