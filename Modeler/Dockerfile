# Dockerfile for bpmn4bc-modeler
FROM node:20.11.1

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Build the webpack bundle once at image-build time (not on every container start)
RUN npm run build

# Defaults for running the services as containers on one Docker network.
# On Railway these are overridden by the service variables.
ENV PORT=5000
ENV DEP_API_BASE_URL=http://deployment:3000
ENV COM_API_BASE_URL=http://compiler:8000
ENV DOCKER_VER=true

EXPOSE 5000

CMD ["node", "server.js"]
