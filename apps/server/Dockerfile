FROM node:20-alpine as build

WORKDIR /app

COPY tsconfig.json ./tsconfig.json
COPY packages ./packages
COPY apps/server/package*.json ./apps/server/
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY apps/server/src ./apps/server/src

WORKDIR /app/apps/server
RUN npm ci
RUN npx esbuild src/main.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node20 \
  --tsconfig=tsconfig.json \
  --outfile=dist/main.cjs

FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/apps/server/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.cjs"]
