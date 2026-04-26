# apps/client

Current Angular app still builds from project root (`src/`).
This directory is created as the target location for the next migration step.

## WS runtime switch

To run gameplay through WebSocket server, set global variable before Angular bootstrap:

`window.__FILLER_WS_URL__ = 'ws://localhost:8080'`

If not set, client uses local in-memory realtime adapter.

## Online flow

- Waiting page creates lobby via `create_game`.
- Another client can join via `join_game` using lobby code.
- Gameplay updates are received as binary WS frames (`state_diff`, `game_over`).
