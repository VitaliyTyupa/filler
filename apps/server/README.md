# apps/server

NestJS server with HTTP endpoints and WebSocket gameplay sessions.

## Endpoints

- `GET /health` -> service liveness and timestamp.
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
