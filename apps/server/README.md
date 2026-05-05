# apps/server

NestJS server with HTTP endpoints and WebSocket gameplay sessions.

Required environment variables:

- `MONGODB_URI` (example: `mongodb://filler_admin:zagalnasprava@mongodb:27017/filler?authSource=filler`)
- `JWT_SECRET`

Environment loading:

- The server first reads process environment variables provided by the runtime
- For local file-based runs it also loads `.env.<NODE_ENV>` and then `.env`
- In production via Portainer, prefer stack environment variables instead of repo env files
- Example files are versioned as `.env.*.example`; real env files should stay untracked

Local MongoDB for development:

1. Start Mongo:
   - `npm run db:up`
2. Use dev env:
   - create `apps/server/.env.development` from `apps/server/.env.development.example`
3. Start server:
   - `npm run dev`
4. Stop Mongo:
   - `npm run db:down`

## Production Note

- `JWT_SECRET` must be provided by the runtime and stay stable for the environment
- `MONGODB_URI` must also come from runtime configuration
- Do not commit real production secrets into repository env files

## Endpoints

- `GET /health` -> service liveness and timestamp.
- `POST /auth/register` -> register and return JWT token.
- `POST /auth/login` -> login and return JWT token.
- `GET /auth/me` -> return current user (`Authorization: Bearer <token>`).
- `POST /stats/games` -> save game activity/statistics for current user.
- `GET /stats/me` -> aggregated user statistics and recent games.
- WebSocket endpoint: `/ws`.

## Gameplay flow

- `create_game` -> creates authoritative state in memory and host room.
- `join_game` -> joins existing room and receives current state.
- Room roles: `host` + `guest`.
- Lobby readiness flow: `set_ready`, `lobby_state`, `start_game`, `game_started`.
- `move` -> validates via `@game-core`, applies diff(s), executes CPU turn on server.
- Broadcasts binary gameplay frames:
  - `state_diff`
  - `game_over`
