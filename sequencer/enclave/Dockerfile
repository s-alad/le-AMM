FROM node:20-slim
WORKDIR /app

# Copy cryptography module first
COPY cryptography ./cryptography/

# Build the cryptography module
WORKDIR /app/cryptography
RUN npm ci
RUN npm run build

# Switch back to main app directory
WORKDIR /app

# Copy enclave files
COPY sequencer/enclave ./

# Create a directory structure for TypeScript path mapping
RUN mkdir -p src/cryptography

# Create symbolic links to the cryptography module files
RUN ln -s /app/cryptography/src/constants.ts /app/src/cryptography/constants.js
RUN ln -s /app/cryptography/src/decryption.ts /app/src/cryptography/decryption.js
RUN ln -s /app/cryptography/src/encryption.ts /app/src/cryptography/encryption.js
RUN ln -s /app/cryptography/src/derive.ts /app/src/cryptography/derive.js

# Install dependencies 
RUN npm install

# Build the application with the correct path references
RUN npm run build

# Expose the port the app runs on
EXPOSE 4000

# Command to run the application
CMD ["node", "dist/index.js"]