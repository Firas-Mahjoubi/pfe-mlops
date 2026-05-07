from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://mlops:mlops_secret@localhost:5432/mlops_platform"

    # JWT auth
    JWT_SECRET_KEY: str = "change-me-to-a-random-256-bit-key"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MLflow
    MLFLOW_TRACKING_URI: str = "http://localhost:5000"

    # MinIO / S3-compatible object store
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_SECURE: bool = False

    # Kubeflow Pipelines
    KFP_HOST: str = "http://localhost:8080"
    KFP_NAMESPACE: str = "kubeflow"

    # Kubernetes / KServe
    KUBECONFIG: str | None = None
    KSERVE_NAMESPACE: str = "mlops"
    KSERVE_SERVICE_ACCOUNT: str = "kserve-sa"

    # CORS — comma-separated list of allowed origins.
    # Local dev defaults; override via env (CORS_ORIGINS) in prod.
    CORS_ORIGINS: str = "http://localhost:4200,http://localhost:30420"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
