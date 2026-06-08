import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.public import router as public_router
from app.api.v1.router import api_router
from app.config import settings
from app.database import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # In production, schema is owned by Alembic migrations. Set RUN_CREATE_ALL=1
    # to keep the legacy auto-create behaviour (useful for local dev only).
    if os.getenv("RUN_CREATE_ALL", "1") == "1":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    # Lightweight, idempotent migration + admin bootstrap. create_all() never
    # ALTERs an existing table, so the `role` column is added explicitly here;
    # then any email in ADMIN_EMAILS is promoted to admin.
    from sqlalchemy import text
    async with engine.begin() as conn:
        try:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "role VARCHAR(20) NOT NULL DEFAULT 'user'"
            ))
        except Exception:  # noqa: BLE001 -- already present / non-Postgres backend
            pass
        admin_emails = settings.admin_emails_list
        if admin_emails:
            try:
                await conn.execute(
                    text("UPDATE users SET role='admin' WHERE lower(email) = ANY(:emails)"),
                    {"emails": admin_emails},
                )
            except Exception:  # noqa: BLE001
                pass
    yield
    await engine.dispose()


app = FastAPI(
    title="MLOps Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
# Public, API-key-authenticated endpoints. Mounted at /api/public, OUTSIDE
# the /api/v1 JWT-protected tree. CORS is wide-open per-handler so any
# third-party site can call the deployed model.
app.include_router(public_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
