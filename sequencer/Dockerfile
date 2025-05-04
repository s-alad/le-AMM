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

# Create a more detailed startup script that will help with debugging
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
echo "\n=== PACKAGE.JSON ==="\n\
cat package.json\n\
echo "\n=== STARTING APPLICATION ==="\n\
# Add a sleep to keep container running in case app exits\n\
(node /app/dist/index.js || echo "Application exited with code $?") && \n\
echo "App execution completed, keeping container alive..." && \n\
# Keep the container running for debugging\n\
tail -f /dev/null\n\
' > start.sh && chmod +x start.sh

# Expose application port
EXPOSE 4000

# Start the application with the debug script
CMD ["/bin/sh", "./start.sh"]