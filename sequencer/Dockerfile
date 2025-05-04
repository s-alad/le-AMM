FROM node:20-alpine
WORKDIR /app
# Copy dependency files
COPY package.json package-lock.json ./
# Install dependencies
RUN npm ci
# Copy source code and config files
COPY tsconfig.json ./
COPY src ./src
# Build the application
RUN npm run build
# Expose the port the app runs on
EXPOSE 4000
# Command to run the application (Use absolute path)
CMD ["/usr/local/bin/node", "dist/index.js"] # <--- CHANGE IS HERE