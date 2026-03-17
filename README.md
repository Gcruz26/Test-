# Alfa Processing Platform

Internal operations platform scaffold with React + TypeScript frontend and FastAPI backend.

## Stack
- Frontend: React + TypeScript (Vite)
- Backend: FastAPI + Python
- Database: PostgreSQL
- ORM: SQLAlchemy
- Authentication: JWT (login/logout)
- Storage: Local storage provider with S3 provider stub for future use

## Structure
- `frontend/` React application with sidebar, auth flow, and placeholder pages
- `backend/` FastAPI API, auth, role checks, and file upload endpoint
- `database/` SQL bootstrap scripts
- `scripts/` convenience scripts for Docker workflow
- `uploads/` local report storage
- `exports/` placeholder for exported files

## Roles
- Admin
- Finance
- Operations
- Viewer

## Placeholder pages
- Dashboard
- Upload Reports
- Interpreter Management
- Validation Queue
- Export Center

## Backend API (REST)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/reports/upload`
- `POST /api/reports/{id}/transform`
- `GET /api/reports`
- `GET /api/reports/{id}`
- `GET /api/operations/dashboard`
- `GET /api/operations/interpreter-management`
- `GET /api/operations/validation-queue`
- `GET /api/operations/export-center`
- `GET /health`

## Database schema
- `users`
- `clients`
- `legal_entities`
- `interpreters`
- `interpreter_client_ids`
- `routing_rules`
- `uploaded_files`
- `raw_rows`
- `standardized_transactions`
- `validation_errors`
- `exports`

Migration support is implemented with Alembic in `backend/alembic/`.

## Default credentials (seeded)
- Email: `admin@alfa.local`
- Password: `admin123`

## Report Upload Contract
- Endpoint: `POST /api/reports/upload` (multipart form-data)
- Required fields:
  - `client_name`
  - `source_platform`
  - `report_type`
  - `period`
  - `file` (`.csv`, `.xls`, `.xlsx`, `.xlsm`)
- Processing flow:
  - Store metadata in `uploaded_files`
  - Save physical file into `uploads/`
  - Parse file preserving unknown columns
  - Insert each parsed row into `raw_rows.raw_payload` as JSON

## Transformation Engine
- Trigger: `POST /api/reports/{id}/transform`
- Source: `raw_rows` of the uploaded report
- Output: `standardized_transactions`
- Supported normalized fields:
  - `service_date`
  - `interpreter_name`
  - `external_interpreter_id`
  - `minutes`
  - `hours`
  - `rate`
  - `amount`
  - `location`
  - `currency`
- Interpreter matching uses `interpreter_client_ids` (`client_id` + `external_id`).
- Client-specific alias mappings are stored in `client_mapping_configs`.

## Run with Docker
1. From project root:
   - `docker compose up --build`
2. Open:
   - Frontend: `http://localhost:5173`
   - Backend docs: `http://localhost:8000/docs`

Stop:
- `docker compose down`

## Run locally without Docker
Prerequisites:
- Python 3.12+
- Node.js 20+
- PostgreSQL 16+

1. Create DB `alfa_processing` in local PostgreSQL.
2. Backend setup:
   - `cd backend`
   - `python -m venv .venv`
   - Windows: `.venv\Scripts\activate`
   - `pip install -r requirements.txt`
   - copy `.env.example` to `.env` and adjust `DATABASE_URL` (for local DB use host `localhost`)
   - set `CORS_ORIGINS` if your frontend is hosted on a different origin
   - `alembic upgrade head`
   - `python scripts_seed.py`
   - `uvicorn app.main:app --reload --port 8000`
3. Frontend setup:
   - `cd frontend`
   - `npm install`
   - copy `.env.example` to `.env`
   - `npm run dev`
4. Open `http://localhost:5173`

## Use Supabase Postgres
Supabase can be used as the PostgreSQL database for this backend, but it does not host the FastAPI server itself.

1. Create a Supabase project.
2. In Supabase, copy the Postgres connection string.
3. In `backend/.env`, set:
   - `DATABASE_URL=postgresql+psycopg://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require`
   - `CORS_ORIGINS=<your-frontend-origin>`
4. Run migrations:
   - `cd backend`
   - `alembic upgrade head`
5. Seed the app data if needed:
   - `python scripts_seed.py`
6. Run the API on your chosen host:
   - `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`

Typical deployment split:
- Supabase: PostgreSQL database
- Backend host: Railway, Render, Fly.io, VM, or Docker host
- Frontend host: Vercel, Netlify, or local Vite dev server

## Architecture notes
- FastAPI routers split by concern (`auth`, `operations`, `reports`).
- DB models isolated under `app/models`.
- Dependency modules handle current user and role authorization.
- Storage is abstracted via provider interface so S3 can replace local storage later.
- Migrations are tracked under `backend/alembic/versions`.
