# kube-hello-file-server

Simple Node.js HTTP file server with:

- a single web page
- file upload
- file listing with download links
- persistent storage in `/data`

## Requirements

- Node.js 20+ for local runs
- Docker and Docker Compose for containerized runs

## Local Run

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open `http://localhost:3000`.

Uploaded files are stored in `./data` when running through Docker Compose, or `/data` by default if you run the app directly without overriding `DATA_DIR`.

## Docker Compose

Build and run:

```bash
docker compose up --build
```

Open `http://localhost:3000`.

The Compose setup bind-mounts `./data` to `/data` in the container so uploaded files persist across restarts.

## Environment Variables

- `PORT`: server port, default `3000`
- `DATA_DIR`: upload directory path, default `/data`

## Notes

- Uploaded files inside `data/` are ignored by Git.
- `data/.gitkeep` is tracked so the directory remains in the repo.
