FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data && adduser -D botuser && chown -R botuser:botuser /app
USER botuser
ENV NODE_ENV=production
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s CMD node -e "try{require('fs').statSync('bot.js')}catch(e){process.exit(1)}"
CMD ["node", "bot.js"]
