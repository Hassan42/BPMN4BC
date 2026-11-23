FROM node:20.11.1

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Defaults for the docker-compose setup; on Railway these are overridden by service variables.
ENV PORT=3000
ENV COM_API_BASE_URL=http://compiler:8000
# instances / models / shared-contract registry live here — mount a persistent volume on it
ENV DATA_DIR=/usr/src/app/data

EXPOSE 3000

CMD ["node", "index.js"]
