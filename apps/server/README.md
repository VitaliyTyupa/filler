# apps/server

NestJS server with HTTP endpoints and WebSocket gameplay sessions.

Required environment variables:

- `MONGODB_URI` (example: `mongodb://filler_admin:zagalnasprava@mongodb:27017/filler?authSource=filler`)
- `JWT_SECRET`

Environment loading:

- Development: `.env.development` then `.env`
- Production: `.env.production` then `.env`

Local MongoDB for development:

1. Start Mongo:
   - `npm run db:up`
2. Use dev env:
   - `MONGODB_URI=mongodb://filler_admin:zagalnasprava@localhost:27017/filler?authSource=filler`
3. Start server:
   - `npm run dev`
4. Stop Mongo:
   - `npm run db:down`

## Endpoints

- `GET /health` -> service liveness and timestamp.
- `POST /auth/register` -> register and return JWT token.
- `POST /auth/login` -> login and return JWT token.
- `GET /auth/me` -> return current user (`Authorization: Bearer <token>`).
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
