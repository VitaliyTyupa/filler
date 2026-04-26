# apps/server

Thin WebSocket server for authoritative gameplay sessions.

## Implemented

- `create_game` event -> server creates authoritative state in memory and host room.
- `join_game` event -> client joins existing room and receives current state.
- Room slots/roles: `host` + `guest`.
- Lobby readiness flow: `set_ready`, `lobby_state`, `start_game`, `game_started`.
- `move` event -> server validates move via `@game-core`, applies diff(s), runs CPU turn on server.
- Broadcasts gameplay frames to room sockets.
- Binary frames:
  - `state_diff`
  - `game_over`

## Next

- Replace in-memory storage with Redis.
- Add request auth and player/session ownership checks.
- Add reconnect strategy for restoring host/guest identity.
