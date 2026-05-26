#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo ".env file not found!"
    exit 1
fi

# Configuration
GRAPHSTATION_FRONTEND_PATH="${GRAPHSTATION_FRONTEND_PATH:-$GRAPHSTATION_WEB_PATH}" # Fallback
GRAPHSTATION_BACKEND_PATH="${GRAPHSTATION_BACKEND_PATH:-$GRAPHSTATION_FRONTEND_PATH/api}"
GRAPHSTATION_DOCKER_PATH="${GRAPHSTATION_DOCKER_PATH:-~/graphstation}"
MODE=${1:-all}

# Helper to upload .env
upload_env() {
    echo "🔑 Uploading .env file..."
    ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "mkdir -p $GRAPHSTATION_BACKEND_PATH"
    cat .env | ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "cat > $GRAPHSTATION_BACKEND_PATH/.env"
}

deploy_frontend() {
    echo "🚀 Starting deployment of GraphStation Frontend..."
    
    # 1. Build the frontend
    echo "📦 Building frontend..."
    cd frontend
    npm install
    npm run build
    cd ..

    # 2. Check if build directory exists
    if [ ! -d "frontend/dist" ]; then
        echo "❌ Build failed, frontend/dist directory not found!"
        return 1
    fi

    # 3. Create and upload tarball
    echo "🗜️ Creating tarball..."
    COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf graphstation_frontend.tar.gz -C frontend/dist .
    
    echo "📤 Uploading and extracting on NAS ($GRAPHSTATION_HOST)..."
    ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "mkdir -p $GRAPHSTATION_FRONTEND_PATH"
    cat graphstation_frontend.tar.gz | ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "tar -xzf - --no-same-owner --no-same-permissions -C $GRAPHSTATION_FRONTEND_PATH"
    
    rm graphstation_frontend.tar.gz
    echo "✅ Frontend deployment finished!"
}

deploy_backend() {
    echo "🚀 Starting deployment of GraphStation Backend..."

    # 1. Create and upload tarball
    echo "🗜️ Creating tarball..."
    COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs --exclude='__pycache__' --exclude='.pytest_cache' --exclude='tests' -czf graphstation_backend.tar.gz -C backend .

    echo "📤 Uploading and extracting on NAS ($GRAPHSTATION_HOST)..."
    ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "mkdir -p $GRAPHSTATION_BACKEND_PATH"
    cat graphstation_backend.tar.gz | ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "tar -xzf - --no-same-owner --no-same-permissions -C $GRAPHSTATION_BACKEND_PATH"

    rm graphstation_backend.tar.gz
    echo "✅ Backend deployment finished!"
}

deploy_docker() {
    echo "🚀 Starting Docker deployment of GraphStation..."
    
    echo "🗜️ Creating tarball with source code and Docker config..."
    # We include backend, frontend (excluding node_modules and dist), and docker configs
    COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs \
        --exclude='backend/__pycache__' \
        --exclude='backend/.pytest_cache' \
        --exclude='backend/tests' \
        --exclude='frontend/node_modules' \
        --exclude='frontend/dist' \
        --exclude='frontend/coverage' \
        --exclude='.git' \
        -czf graphstation_docker.tar.gz \
        backend frontend docker docker-compose.yml users.txt .env
        
    echo "📤 Uploading and extracting on NAS ($GRAPHSTATION_HOST) to $GRAPHSTATION_DOCKER_PATH..."
    ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "mkdir -p $GRAPHSTATION_DOCKER_PATH"
    cat graphstation_docker.tar.gz | ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "tar -xzf - --no-same-owner --no-same-permissions -C $GRAPHSTATION_DOCKER_PATH"
    
    echo "🧹 Cleaning up legacy Docker files on remote target..."
    ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "rm -f $GRAPHSTATION_DOCKER_PATH/backend/Dockerfile $GRAPHSTATION_DOCKER_PATH/frontend/Dockerfile $GRAPHSTATION_DOCKER_PATH/frontend/nginx.conf $GRAPHSTATION_DOCKER_PATH/frontend/.dockerignore"
    
    rm graphstation_docker.tar.gz
    
    echo "🏗️ Building and starting Docker containers on NAS..."
    ssh "$GRAPHSTATION_USER@$GRAPHSTATION_HOST" "cd $GRAPHSTATION_DOCKER_PATH && docker-compose up -d --build"
    
    echo "✅ Docker deployment and build finished!"
}

case $MODE in
    frontend)
        deploy_frontend
        upload_env
        ;;
    backend)
        deploy_backend
        upload_env
        ;;
    all)
        deploy_frontend
        deploy_backend
        upload_env
        ;;
    docker)
        deploy_docker
        ;;
    *)
        echo "Usage: $0 [frontend|backend|all|docker]"
        exit 1
        ;;
esac

echo ""
echo "🎉 All requested deployments finished successfully!"
