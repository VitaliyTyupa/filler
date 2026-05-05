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

Primary production deployment model:

- deploy images through Portainer Stack
- set backend runtime variables in the Portainer stack environment
- do not rely on committed `.env` files for production

Reference files:

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
- Portainer
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

## Production Via Portainer

Use a Portainer stack based on `docker-compose.prod.yml` or an equivalent inline stack.

Required backend environment variables in the stack:

- `NODE_ENV=production`
- `PORT=3000`
- `JWT_SECRET=<stable production secret>`
- `MONGODB_URI=<production mongo uri>`

Frontend environment variables are not required for the current setup. The frontend infers:

- API origin as `https://api.<current-domain>`
- WebSocket URL as `wss://api.<current-domain>/ws`

Operational checks after deploy:

- `https://filler.leo-lab.app`
- `https://api.leo-lab.app/health`
- `wss://api.leo-lab.app/ws`

## Env Files

- `.env.prod.example` is only a reference template and must not contain real secrets
- committed `.env` files are not used as the source of truth for production
- use `apps/server/.env.development.example` only as a starting point for a local untracked `apps/server/.env.development`

## Image Publishing

GitHub Actions builds and pushes both images on every push to `main`.

Important detail:

- frontend image is built from repository root with `Dockerfile`
- backend image is built from repository root with `apps/server/Dockerfile`

This is required because the backend depends on source from `packages/game-core` and `packages/shared`.
