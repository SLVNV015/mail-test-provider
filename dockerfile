FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM base AS builder
RUN npm run build
RUN npm prune --production && npm cache clean --force

FROM base AS development
ENV NODE_ENV=development
CMD [ "npm" , "run", "dev" ]

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN chown -R node:node /app
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

USER node

CMD ["node", "dist/main.js"]
