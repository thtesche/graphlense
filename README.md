# GraphStation 📸🕸️

GraphStation is a lightweight, non-linear photo browser and gallery designed specifically for Synology NAS users. Instead of navigating rigid folder structures, GraphStation allows you to explore your photo collection through its underlying graph of relationships—connecting people, locations, objects, and time.

## 🌟 Features

- **Graph-Based Navigation:** Pivot through your collection by clicking on metadata "neighbors" (Persons, Locations, AI-detected Objects).
- **Lightweight Architecture:** Designed to run on resource-constrained hardware (e.g., Synology NAS with 2GB RAM).
- **Native Integration:** Utilizes Synology's internal session authentication and thumbnail APIs for seamless performance.
- **POLE+O Data Model:** Built on a Labeled Property Graph (LPG) schema using [Memgraph](https://memgraph.com/).

## 📋 Prerequisites

Before setting up GraphStation, ensure your system meets the following requirements:

- **Synology NAS:** Running **DSM 7.x** with **Synology Photos** installed.
- **Web Station:** Installed and configured on your Synology NAS (required for hosting the frontend and Python API).
- **SSH Access:** Enabled on your NAS for automated deployment.
- **Memgraph:** A running instance of Memgraph (typically via Docker on the NAS).
- **Metadata Sync:** Data must be synced using [synofoto-graph-sync](https://github.com/thtesche/synofoto-graph-sync).

## 🏗️ Architecture

- **Database:** Memgraph (Docker-based) for high-performance graph traversal.
- **Backend:** Lightweight Python (FastAPI/Flask) running bare-metal on Synology Web Station.
- **Frontend:** React SPA (Static) hosted on Synology Web Station.

## 🚀 Deployment Options

GraphStation can be deployed natively on the Synology NAS via Web Station, or containerized on an external Linux machine or Mini-PC using Docker.

### Option A: Hosting on Synology NAS (Web Station)

For detailed setup and deployment instructions, see our [NAS Deployment Guide](docs/deployment.md).

1. **Local Setup:** Run `./setup_local.sh` on your local development machine to create the `.env` configuration file and install frontend dependencies (requires Node.js/npm).
2. **Prepare Memgraph:** Run Memgraph in Docker on your NAS.
3. **Sync Metadata:** Use [synofoto-graph-sync](https://github.com/thtesche/synofoto-graph-sync) to populate the graph from Synology Photos.
4. **Deploy Backend & Frontend:** Run `./deploy.sh` to automatically build the React app and deploy it along with the Python API to your NAS.

### 🐳 Option B: Hosting on an External Machine (Docker)

If you prefer to host GraphStation on a separate Linux server, Mini-PC, or cloud instance, you can use the fully automated Docker Compose setup.

1. **Local Setup:** Run `./setup_local.sh` and configure your `.env` file (ensure you set the target machine IP and your `SYNOLOGY_URL`).
2. **Deploy via Script:** Run `./deploy.sh docker` to transfer code, build contexts, and configurations to the remote host.
3. **Start Containers:** SSH into the remote machine, navigate to the deployment folder, and run `docker-compose up -d --build`.

For detailed setup steps, see our [Docker Deployment Guide](docs/deployment_docker.md).


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
