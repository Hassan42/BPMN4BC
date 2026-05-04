# Dockerfile for bpmn4bc-modeler
FROM node:20.11.1

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app's code
COPY . .

# Build the webpack bundle once at image-build time (not on every container start)
RUN npm run build

# These are the same for every student container (Docker service names in student network)
ENV DEP_API_BASE_URL=http://deployment:3000
ENV COM_API_BASE_URL=http://compiler:8000
ENV DOCKER_VER=true

EXPOSE 5000

# Only start the Express server — webpack is already done
CMD ["node", "server.js"]
