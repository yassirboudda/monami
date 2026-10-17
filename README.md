# Stockflow

Next.js frontend and FastAPI backend for managing marketplace shops, listings, inventory, and workflows.

## Live

- Front: https://stockflow.amirelay.com (primary)
- Fallback: https://stockflow-nine-ashy.vercel.app
- Repo: https://github.com/yassirboudda/hackathon
- API (Hetzner): http://178.104.100.35/health
- Browser calls API via same-origin `/backend/*` (Next rewrite → VPS)

## Features

- **Clerk** sign-in with organization workspaces
- **Chat** + image upload → Nebius DeepSeek via backend
- **Boutique**: shops + listings on one flow (click a shop → its annonces; button « Voir toutes les annonces »)
- **Extension Chrome** (`extension/` + download `/stockflow-extension.zip`) to capture Vinted / Leboncoin cookies
- Shared stock across organization workspaces / marketplace workflow templates

## Security

**Never commit secrets** to this public repo. Put keys only in:

- VPS `/home/deploy/apps/stockflow-api/.env`
- Hermes service environment file on the host (outside the repository)
- Vercel project env vars
- Private deployment handoff file (not in git)

`backend/.env.example` is a template only.

## Dev (front)

```bash
cp .env.example .env.local
# configure Clerk keys from your deployment settings
npm install
npm run dev
```

## Backend (VPS)

Code: `backend/` in this repo. Deploy path on server: `/home/deploy/apps/stockflow-api`.

```bash
rsync -az -e "ssh -i ~/.ssh/hackathon_ed25519" \
  --exclude '.venv' --exclude '.env' --exclude '__pycache__' \
  ./backend/ deploy@178.104.100.35:/home/deploy/apps/stockflow-api/
ssh -i ~/.ssh/hackathon_ed25519 deploy@178.104.100.35 \
  'sudo systemctl restart stockflow-api && curl -sS http://127.0.0.1:3000/health'
```

Keep the backend bound to `127.0.0.1:3000`; port `8080` is reserved by the host.

## Deploy front

```bash
git push origin main
# Vercel auto-deploys from GitHub
```
