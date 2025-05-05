# Dockerfile for app1 using Node.js 20.11.1
FROM node:20.11.1

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies specific to app1
RUN npm install

# Copy the rest of the app's code
COPY . .

# Expose the app's port (if needed)
# EXPOSE 5000

# Command to run the app
CMD ["npm", "run", "start:docker"]
