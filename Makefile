.PHONY: help install up down dev dev-api dev-web test typecheck lint benchmark build

help:
	@echo "Available commands:"
	@echo "  make install    - Install all dependencies across workspaces"
	@echo "  make up         - Start PostgreSQL and Redis in background via Docker"
	@echo "  make down       - Stop Docker containers"
	@echo "  make dev        - Run both API and Web in development mode"
	@echo "  make test       - Run Vitest automated test suite"
	@echo "  make typecheck  - Run TypeScript type checks"
	@echo "  make lint       - Run linting checks"
	@echo "  make benchmark  - Run k6 load test scenarios"
	@echo "  make build      - Build API and Next.js applications"

install:
	pnpm install

up:
	docker compose up -d

down:
	docker compose down

dev:
	pnpm dev

dev-api:
	pnpm dev:api

dev-web:
	pnpm dev:web

test:
	pnpm test

typecheck:
	pnpm typecheck

lint:
	pnpm lint

benchmark:
	k6 run benchmarks/k6-load-test.js

build:
	pnpm build
