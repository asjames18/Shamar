# API service: builds TypeScript, runs compiled JS. Runtime needs no npm deps
# (node:sqlite is built into Node 22+; the HTTP server uses only node:http).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY apps/api/ ./apps/api/
COPY apps/web/package.json ./apps/web/package.json
RUN npm install && npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist/ ./dist/
COPY --from=build /app/packages/types/dist/ ./node_modules/@control-plane/types/dist/
COPY --from=build /app/packages/types/package.json ./node_modules/@control-plane/types/package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
