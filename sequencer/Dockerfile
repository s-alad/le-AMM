FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Create a startup script with debugging info
RUN echo '#!/bin/sh\n\
echo "=== SYSTEM INFO ==="\n\
uname -a\n\
echo "\n=== ENVIRONMENT ==="\n\
env | sort\n\
echo "\n=== FILESYSTEM ==="\n\
ls -la /usr/local/bin\n\
echo "\n=== NODE INFO ==="\n\
which node || echo "node not in PATH"\n\
echo "\n=== APPLICATION FILES ==="\n\
ls -la /app\n\
ls -la /app/dist\n\
echo "\n=== STARTING APPLICATION ==="\n\
exec /usr/local/bin/node /app/dist/index.js\n\
' > start.sh && chmod +x start.sh

# Expose application port
EXPOSE 4000

# Start the application with the debug script
CMD ["/bin/sh", "./start.sh"]