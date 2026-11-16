# AutoPrep AI

Intelligent dataset preparation SaaS platform (FastAPI modular monolith + React/TypeScript + PostgreSQL + MinIO + Redis).

## Quick Start (Docker Compose)

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Start all services:
   ```bash
   docker compose up --build
   ```
3. Access services:
   - **Frontend:** http://localhost:5173
   - **Backend API & Swagger Docs:** http://localhost:8000/docs
   - **MinIO Console:** http://localhost:9001
