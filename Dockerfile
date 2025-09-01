# Multi-stage build para TecnoBot SAAS
FROM node:18-alpine AS base

# Instalar dependencias del sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    vips-dev \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production && npm cache clean --force

# Stage de producción
FROM node:18-alpine AS production

# Instalar dependencias mínimas de runtime
RUN apk add --no-cache \
    vips \
    cairo \
    jpeg \
    pango \
    musl \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S tecnobot -u 1001 -G nodejs

WORKDIR /app

# Copiar dependencias desde stage base
COPY --from=base --chown=tecnobot:nodejs /app/node_modules ./node_modules
COPY --from=base --chown=tecnobot:nodejs /app/package*.json ./

# Copiar código fuente
COPY --chown=tecnobot:nodejs src ./src
COPY --chown=tecnobot:nodejs .env.example ./

# Crear directorios necesarios
RUN mkdir -p /app/logs /app/uploads /app/sessions /app/temp && \
    chown -R tecnobot:nodejs /app/logs /app/uploads /app/sessions /app/temp

# Cambiar a usuario no-root
USER tecnobot

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Comando de inicio
CMD ["npm", "start"]