# ETAPA 1: Construcción
FROM node:24.14.0-slim AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ETAPA 2: Producción
FROM node:24.14.0-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production
# Copiamos lo compilado desde la etapa anterior
COPY --from=builder /usr/src/app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
