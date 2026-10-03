# 单镜像：Express API + 静态前端（与 npm start 同端口模型）
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web

RUN npm install --no-fund --no-audit \
  && npm run build

# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/package.json ./web/package.json
COPY --from=build /app/web/dist ./web/dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5178
ENV SMG_DATA_DIR=/app/data

EXPOSE 5178
CMD ["node", "server/dist/index.js"]
