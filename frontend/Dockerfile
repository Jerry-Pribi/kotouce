# ---- Fáze 1: Build React aplikace ----
FROM node:20-alpine AS build

WORKDIR /app

# Nainstaluj závislosti (cache vrstva)
COPY package*.json ./
RUN npm ci

# Zkopíruj zdrojové kódy a postav produkční build
COPY . .
RUN npm run build

# ---- Fáze 2: Nginx servuje hotový build ----
FROM nginx:alpine

# Zkopíruj zkompilovaný React build do nginx složky
COPY --from=build /app/dist /usr/share/nginx/html

# Vlastní nginx konfigurace (SPA routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
