.PHONY: up up-dev down build logs test lint seed backend-shell db-migrate db-revision test-backend test-frontend

up: ## Start light stack (no bind-mount reload)
	docker compose -f docker-compose.yml up -d

up-dev: ## Start heavy hot-reload stack
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

down: ## Stop all services
	docker compose -f docker-compose.yml down

build: ## Rebuild light images
	docker compose -f docker-compose.yml build

logs: ## Tail all logs
	docker compose logs -f

backend-shell: ## Shell into backend container
	docker compose exec backend bash

db-migrate: ## Run Alembic migrations
	docker compose exec backend alembic upgrade head

db-revision: ## Create new migration (usage: make db-revision msg="add users table")
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

test-backend: ## Run backend tests
	docker compose exec backend pytest tests/ -v

test-frontend: ## Run frontend tests
	docker compose exec frontend npm test

test: test-backend test-frontend ## Run all tests

lint: ## Lint both projects
	docker compose exec backend ruff check .
	docker compose exec backend ruff format --check .
	docker compose exec frontend npm run lint

seed: ## Seed sample data
	docker compose exec backend python scripts/seed_data.py

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
