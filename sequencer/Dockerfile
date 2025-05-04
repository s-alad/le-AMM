# ---------- 1. Build stage ----------
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build                     # -> dist/**

# ---------- 2. Runtime stage ----------
FROM public.ecr.aws/amazonlinux/amazonlinux:2023
WORKDIR /app

# Install Node.js in the runtime stage
RUN curl -sL https://rpm.nodesource.com/setup_20.x | bash - && \
    yum install -y nodejs && \
    yum clean all

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/index.js"]
