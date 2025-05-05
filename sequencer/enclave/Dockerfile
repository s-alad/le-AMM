FROM node:20-slim
WORKDIR /app

# Copy cryptography module first - copy everything at once
COPY cryptography ./cryptography/

# Build the cryptography module
WORKDIR /app/cryptography
RUN npm ci
RUN npm run build

# Switch back to main app directory and copy everything from enclave
WORKDIR /app
COPY sequencer/enclave ./

# Make sure package.json is valid before installing
RUN cat package.json

# Install dependencies
RUN npm install --no-package-lock

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 4000

# Command to run the application (Use absolute path)
CMD ["/usr/local/bin/node", "/app/dist/index.js"]