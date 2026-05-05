# Filler

Filler consists of:

- Angular frontend served by `nginx`
- Node.js WebSocket backend
- Traefik-based production routing

## Production Readiness

The main deployment blockers were removed:

- Frontend now infers API and WebSocket hosts from the current browser origin
- Backend Docker image now builds from the repository root, so local `packages/*` dependencies are available during image build
- Backend production image is bundled into a single runnable `dist/main.js`, so Node does not depend on TypeScript path aliases at runtime

Prepared deployment files:

- `docker-compose.prod.yml`
- `.env.prod.example`
- `Dockerfile`
- `apps/server/Dockerfile`
- `.github/workflows/deploy.yml`

## Local Development

Frontend:

```bash
npm ci
npm start
```

Backend:

```bash
cd apps/server
npm ci
npm run dev
```

Default local WebSocket URL is defined in `public/env.js`:

```text
ws://localhost:8080/ws
```

Default local API URL for auth is:

```text
http://localhost:8080
```

## Production Prerequisites

The production server must already have:

- Docker Engine
- Docker Compose plugin
- Traefik running and attached to external Docker network `web`
- DNS records:
  - `filler.leo-lab.app`
  - `api.leo-lab.app`
- access to GHCR images `ghcr.io/vitaliytyupa/filler-frontend:latest`
  and `ghcr.io/vitaliytyupa/filler-backend:latest`

If GHCR packages are private, authenticate first:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

## Deployment Order

1. Copy deployment files to the server:

```bash
scp docker-compose.prod.yml .env.prod user@server:/opt/filler/
```

2. Create the runtime env file:

```bash
cd /opt/filler
cp .env.prod .env
```

3. Ensure Traefik external network exists:

```bash
docker network inspect web >/dev/null 2>&1 || docker network create web
```

4. Pull the latest images:

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
```

5. Start or update the stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

6. Check container state:

```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
```

7. Verify application endpoints:

- frontend: `https://filler.leo-lab.app`
- backend websocket endpoint behind Traefik: `wss://api.leo-lab.app/ws`

## Update Procedure

To deploy a newer version:

```bash
cd /opt/filler
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

## Image Publishing

GitHub Actions builds and pushes both images on every push to `main`.

Important detail:

- frontend image is built from repository root with `Dockerfile`
- backend image is built from repository root with `apps/server/Dockerfile`

This is required because the backend depends on source from `packages/game-core` and `packages/shared`.
