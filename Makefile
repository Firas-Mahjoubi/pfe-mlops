PIPELINE_IMAGE ?= localhost:5001/pipeline-runner:latest

.PHONY: dev dev-down dev-logs backend frontend pipeline-image pipeline-image-push

# Start all services with Docker Compose
dev:
	cd infrastructure/docker-compose && docker compose up --build -d

# Stop all services
dev-down:
	cd infrastructure/docker-compose && docker compose down

# View logs
dev-logs:
	cd infrastructure/docker-compose && docker compose logs -f

# Run backend locally (requires postgres running)
backend:
	cd backend && uvicorn app.main:app --reload --port 8000

# Run frontend locally
frontend:
	cd frontend && npx ng serve

# Build the pre-baked pipeline runner image (eliminates per-run pip installs)
pipeline-image:
	docker build -t $(PIPELINE_IMAGE) infrastructure/docker/pipeline-runner/

# Push to the in-cluster registry then set env var so the backend uses it
pipeline-image-push: pipeline-image
	docker push $(PIPELINE_IMAGE)
	@echo ""
	@echo "Add to backend/.env:"
	@echo "  PIPELINE_RUNNER_IMAGE=$(PIPELINE_IMAGE)"
