FROM node:20-alpine

WORKDIR /app

# Dépendances (couche cache séparée)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Code
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# Volume persistant Coolify à monter ici (contenu + images uploadées)
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 3000
CMD ["node", "server.js"]
