FROM node:20-alpine3.19 as deploy

WORKDIR /app

# Instalar dependencias necesarias
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    vips-dev

# Copiar archivos del proyecto
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Instalar pnpm
RUN npm install -g pnpm

# Instalar dependencias
RUN pnpm install --prod=false

# Copiar el resto de archivos
COPY . .

# Puerto por defecto
EXPOSE 3000

# Comando para iniciar
CMD ["pnpm", "start"]