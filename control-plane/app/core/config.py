import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://iaas_user:iaas_password@db:5432/iaas_db")
    COMPUTE_NODE_URL: str = os.getenv("COMPUTE_NODE_URL", "compute-node:50051")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-for-hackathon-only")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

settings = Settings()
