# SMG Workshop (AI Self-Media Content Platform)

[中文](README.md)

An all-in-one AI self-media creation toolkit: **hot-topic radar → writing workbench → expert tracks → model settings**. Ships with embedded SQLite out of the box, plus desktop and Docker deployment options.

## Screenshots

Hot Radar — track trending topics and refine angles.

![Hot Radar](images/redian.png)

Writing Workbench — end-to-end drafting and layout.

![Writing Workbench](images/chuangzuo.png)

Expert Tracks — personas, styles, and constraints by vertical.

![Expert Tracks](images/zhuanjia.png)

Model Settings — manage multiple LLM providers and API keys.

![Model Settings](images/moxing.png)

## Architecture

```
shared/   Shared types & utilities (@smg/shared)
server/   Express + SQLite (better-sqlite3) + WebSocket
web/      React 18 + Vite + Ant Design
desktop/  Electron app (local / remote modes)
docs/     Design docs and implementation plans
```

## Quick Start

```bash
npm install
npm run setup    # install deps and seed data (optional as needed)
npm run dev
```

Default development ports:

- Frontend (Vite): http://localhost:5173
- Backend API: http://localhost:5178 (can also serve built `web/dist`)

Single-port production-style run:

```bash
npm run build
npm start
# Open http://localhost:5178/
```

Default admin account: `admin` / `admin123` (change under **Settings → Account Security**).

> Without an LLM API key, mock mode can still drive the UI for demos.

## Database

Uses embedded **SQLite** by default. On first launch the data directory, schema, and seed data are created automatically — no extra install required.

| Config | Description |
|------|------|
| `SMG_DATA_DIR` | Data root (`smg.db`, uploads, images, …) |
| `PORT` / `HOST` | Listen port and host (defaults `5178` / `127.0.0.1`) |

Desktop local mode always uses SQLite under the OS user data directory (see [`desktop/README.md`](desktop/README.md)).

## Docker

```bash
docker compose up -d
```

Open **http://localhost:5178/**. Data persists in the `smg_data` named volume.

Or pull the GHCR image after a release:

```bash
docker pull ghcr.io/<owner>/self-media-generation:latest
```

## Desktop App

Install and run without deploying a separate database:

```bash
npm run desktop:install    # electron / electron-builder
npm run desktop:prepare    # build server/web and stage runtime
npm run desktop:dev        # launch desktop app

npm run desktop:dist       # package current platform → desktop/release/
```

- **Local mode (default)**: reuses Electron’s built-in Node to run the backend; SQLite lives in the user data directory; the backend serves the frontend.
- **Remote mode**: **Mode → Set remote console URL…**
- Details: [`desktop/README.md`](desktop/README.md).

## Automated Releases (GitHub Actions)

Pushing **main / master** (or manually running the workflow) auto-bumps the version and publishes.

```bash
git push origin main
# or: Actions → Release → Run workflow
```

What it does:

1. Bumps **patch +1** from the latest `v*` / `x.y.z` tag (first release is `v1.0.0`);
2. Builds a **single** Docker image (static frontend + API), ships `*-linux-amd64.tar.gz`, and on release pushes to GHCR  
   (`ghcr.io/<owner>/self-media-generation`); serve at `http://localhost:5178/`;
3. Packages desktop installers on Windows / macOS / Linux (NSIS, dmg/zip, AppImage/deb);
4. Aggregates artifacts into a **GitHub Release**.

PRs and non-trunk branches only build artifacts — **no GHCR push, no Release**.

Day-to-day CI (`.github/workflows/ci.yml`) runs `npm run typecheck` and `npm run build` on every push / PR.

## Features

| Module | Description |
|------|------|
| Writing Workbench | Topic → outline → draft → images |
| Hot Radar | Trend crawling and topic assist |
| Copywriting / Novel | Copy bank and serialized fiction |
| Expert Tracks | Vertical personas and style rules |
| Templates / Library / Images | Templates and media assets |
| Settings | Model providers, account security, … |

## License

Internal use.
