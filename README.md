# Filler Monorepo

This repository hosts the Angular client, Node server, and shared game engine for Filler.

## Workspaces

- `client` – Angular front-end
- `server` – Node/Express backend
- `shared` – TypeScript game engine shared between client and server

## Scripts

From the repository root:

- `npm run client:dev` – start the Angular dev server
- `npm run client:build` – build the client
- `npm run server:dev` – start the Node server in development mode
- `npm run server:build` – build the server
- `npm run shared:build` – build the shared package

Install dependencies with `npm install`; the shared package will be built automatically after install.
