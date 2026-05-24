# Stage 1: Build the React application
FROM node:22-alpine AS build
WORKDIR /app

# Accept VITE_SYNOLOGY_URL build argument and expose it to Vite
ARG VITE_SYNOLOGY_URL
ENV VITE_SYNOLOGY_URL=$VITE_SYNOLOGY_URL

ARG VITE_DEV_MODE
ENV VITE_DEV_MODE=$VITE_DEV_MODE

# Install dependencies first for better caching
COPY frontend/package*.json ./
RUN npm install

# Copy source files and build
COPY frontend/ .
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# The Vite config uses base: '/graphstation/'
# So we need to place the files in a matching directory structure in Nginx
RUN mkdir -p /usr/share/nginx/html/graphstation

# Copy the build output from the first stage
COPY --from=build /app/dist /usr/share/nginx/html/graphstation

# Copy the custom Nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 and 443
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
