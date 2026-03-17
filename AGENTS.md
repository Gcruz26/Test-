# AGENTS.md

## Project Overview
- Monorepo for Alfa Processing Platform.
- Frontend: Next.js + React + TypeScript in `frontend/`.
- Backend: FastAPI + SQLAlchemy + Alembic in `backend/`.
- Database and local infra helpers live in `database/`, `supabase/`, and `docker-compose.yml`.

## Working Directories
- Frontend app code: `frontend/`
- Backend API code: `backend/`
- Database bootstrap assets: `database/`
- Utility scripts: `scripts/`
- Local file storage: `uploads/`
- Export output: `exports/`

## Run Commands
- Frontend dev: `cd frontend && npm run dev`
- Frontend build: `cd frontend && npm run build`
- Backend dev: `cd backend && python -m uvicorn app.main:app --reload --port 8000`
- Backend migrations: `cd backend && alembic upgrade head`
- Backend seed: `cd backend && python scripts_seed.py`
- Full stack with Docker: `docker compose up --build`

## Environment
- Backend env file: `backend/.env`
- Backend template: `backend/.env.example`
- Frontend env file: `frontend/.env`
- Frontend template: `frontend/.env.example`

## Agent Guidelines
- Prefer root-cause fixes over narrow patches.
- Preserve any user changes already present in the worktree.
- Use `rg` for search and keep edits minimal and local to the task.
- Use `apply_patch` for manual file edits.
- Validate changes with the smallest relevant command when possible.

## Notes
- The root `README.md` still references Vite in places, but the current frontend is Next.js. Treat `frontend/package.json` as the source of truth for frontend tooling.
