from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models.base import Base

from app.routers import auth, instances, admin, terminal

app = FastAPI(title="Hackathon IaaS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    import asyncio
    async with engine.begin() as conn:
        # Ensure HIBERNATING enum value exists in PostgreSQL
        await conn.execute(
            __import__('sqlalchemy').text("ALTER TYPE instancestatus ADD VALUE IF NOT EXISTS 'HIBERNATING'")
        )
        await conn.run_sync(Base.metadata.create_all)
    # Start hibernation monitor in background
    from app.services.instance import hibernation_monitor
    asyncio.create_task(hibernation_monitor())

app.include_router(auth.router, prefix="/api/v1")
app.include_router(instances.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(terminal.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "ok"}
