from fastapi import APIRouter

from app.api.v1.activity import router as activity_router
from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.cluster import router as cluster_router
from app.api.v1.projects import router as projects_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.experiments import router as experiments_router
from app.api.v1.pipelines import router as pipelines_router
from app.api.v1.models import router as models_router
from app.api.v1.deployments import router as deployments_router
from app.api.v1.monitoring import router as monitoring_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(projects_router)
api_router.include_router(uploads_router)
api_router.include_router(experiments_router)
api_router.include_router(pipelines_router)
api_router.include_router(models_router)
api_router.include_router(deployments_router)
api_router.include_router(monitoring_router)
api_router.include_router(activity_router)
api_router.include_router(cluster_router)
api_router.include_router(admin_router)
