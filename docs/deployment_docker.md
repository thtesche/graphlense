# Deployment Option B: External Machine (Docker)

This guide describes the deployment of GraphStation components (Memgraph database, Memgraph Lab, and Backend API) on an external target machine using Docker Compose.

## Prerequisites

- A target machine (e.g., Linux server, Mini-PC, Raspberry Pi, or cloud VM).
- **Docker** and **Docker Compose** must be installed on the target machine.
- Access to the target machine (e.g., via SSH).

## 1. Transfer Project Files to the Target Machine

You must copy the Docker and code configuration to the target machine.

### Method A: Automated via `deploy.sh` (Recommended)
Since we have a deployment script, you can have the backend and the `.env` file transferred directly from your local development machine to the target machine.

1. **Configuration:** Make sure that the SSH access and paths for the target machine are entered in your `.env`. Crucially, you must also define where your actual Synology NAS is located using `SYNOLOGY_URL` so that the app knows where to fetch images and authenticate:
   - `GRAPHSTATION_HOST=192.168.0.XXX` (The IP of the machine running Docker)
   - `GRAPHSTATION_USER=your_user`
   - `GRAPHSTATION_DOCKER_PATH=~/graphstation_docker`
   - `SYNOLOGY_URL=http://192.168.0.YYY:5000` (The URL and port of your actual Synology NAS)
2. **Transfer:** Run the following command locally:
   ```bash
   ./deploy.sh docker
   ```
   *The script packages the backend source, frontend source, the `docker/` folder (containing the Dockerfiles and Nginx configuration), docker-compose config, and the `.env` file, uploads everything to the target machine, and extracts it in the `$GRAPHSTATION_DOCKER_PATH` folder.*

3. **Database Credentials:** The script automatically copies `users.txt` as well. You just need to SSH into the NAS and start Docker.

---

### Method B: Manual via `rsync`
If you want to transfer everything manually, make sure the paths are correct:

```bash
# Copies docker-compose, users.txt, local .env (as backend/.env), and the docker/backend/frontend directories to the target machine
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' --exclude 'tests' --exclude '__pycache__' --exclude '.pytest_cache' docker-compose.yml users.txt docker backend frontend your_user@192.168.0.XXX:~/graphstation/
cp .env ~/graphstation/backend/.env  # The .env must be in the backend folder on the target machine!
```
*(Note: Please note that with `rsync`, the `docker`, `backend`, and `frontend` folders must be specified without a trailing slash `/` so that the directories themselves are copied).*

## 2. Adjust Database Credentials (users.txt)

The `users.txt` file contains the credentials for the Memgraph database in the format `username:password`.
By default, we have set up `admin:admin` locally.

Open the file on the target machine and change the password for security reasons:

```bash
cd ~/graphstation/
nano users.txt
```

## 3. Start Docker Containers

Navigate to the folder containing the `docker-compose.yml` and start the containers in the background (`-d`):

```bash
cd ~/graphstation/
docker-compose up -d
```
*(Note: On newer systems, the command is `docker compose up -d` without a hyphen).*

Docker Compose will now:
1. Download the required images (Memgraph & Memgraph Lab).
2. Build the API backend and React frontend images locally using the Dockerfiles in the `docker/` folder and the root workspace context.
3. Automatically create the local folders `data/` (for the persistent database) and `log/` in the current directory.
4. Start the containers.

## 4. Check Status and Access

Check if the containers are running without errors:

```bash
docker-compose ps
```

or to view the logs:

```bash
docker logs -f graphstation-api
```

    There should be four active services:
- **memgraph-server** (Port 7687)
- **memgraph-lab** (Port 3000)
- **graphstation-api** (Port 5000)
- **graphstation-frontend** (Port 80)

### Access & Tests

1. **Frontend App:** Access `http://<target-ip>/graphstation/` in your browser.
2. **Memgraph Lab:** Access `http://<target-ip>:3000` via your web browser and log in using the credentials from your `users.txt`.
3. **Backend API:** The backend is accessible at `http://<target-ip>:5000` (or directly through the frontend via `http://<target-ip>/graphstation-api/`).

The database itself (Bolt protocol) is accessible via port **7687**.

### Viewing Logs (Debugging)

Gunicorn is configured to output all API access and system logs directly to Docker (stdout/stderr). Nginx also logs all access and error messages for the frontend. You can monitor the logs live using the following commands:

**Backend Logs:**
```bash
docker logs -f graphstation-api
```

**Frontend / Nginx Logs:**
```bash
docker logs -f graphstation-frontend
```

This is very helpful to diagnose database connection issues or authentication errors with the Synology NAS, for example.

## 5. Updates and Management

**Stop containers:**

```bash
docker-compose down
```
*(Your data will be safely preserved in the `data/` folder).*

**Update images:**
If you want to update to the latest versions:

```bash
docker-compose pull
docker-compose up -d
```
