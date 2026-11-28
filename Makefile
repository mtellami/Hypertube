.DEFAULT_GOAL := help

.PHONY: help dev prod down dev-down clean logs dev-logs

help:
	@printf '%s\n' \
	  'make dev       Build and start the local stack' \
	  'make prod      Build and start production in the background' \
	  'make down      Stop production (keep data)' \
	  'make dev-down  Stop the local stack (keep data)' \
	  'make clean     Remove both stacks, volumes and networks (delete saved data)' \
	  'make logs      Follow production logs' \
	  'make dev-logs  Follow local logs'

dev:
	docker compose -f docker-compose-dev.yml up --build

prod:
	docker compose up -d --build

down:
	docker compose down

dev-down:
	docker compose -f docker-compose-dev.yml down

clean:
	docker compose -f docker-compose-dev.yml down --volumes --remove-orphans
	docker compose -f docker-compose.yml down --volumes --remove-orphans

logs:
	docker compose logs -f

dev-logs:
	docker compose -f docker-compose-dev.yml logs -f
