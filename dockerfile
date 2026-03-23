
Richard Gonzalez
3:34 p.m. (hace 0 minutos)
para mí

# ==========================================
# ETAPA 1: Construcción (Builder)
# Aquí instalamos TODO y compilamos el código
# ==========================================
FROM node:24.14.0-slim AS builder

WORKDIR /usr/src/app

# Copiamos los archivos de dependencias
COPY package*.json ./

# Instalamos TODAS las dependencias (incluyendo devDependencies como Babel y TS)
RUN npm install

# Copiamos todo el código fuente (incluyendo configuraciones de Babel/TS)
COPY . .

# Ejecutamos el script de compilación (Babel/TypeScript)
RUN npm run build

# ==========================================
# ETAPA 2: Producción (Production)
# Aquí creamos la imagen final, limpia y ligera
# ==========================================
FROM node:24.14.0-slim

WORKDIR /usr/src/app

# Copiamos solo los archivos de dependencias
COPY package*.json ./

# Instalamos SOLO las dependencias necesarias para que corra (ignorando TS/Babel)
RUN npm ci --only=production

# Copiamos el código ya compilado desde la Etapa 1 (asumiendo que se genera en la carpeta "dist")
COPY --from=builder /usr/src/app/dist ./dist

# Exponemos el puerto de tu API
EXPOSE 3000

# Ejecutamos el JavaScript puro ya compilado
CMD ["node", "dist/src/server.js"]