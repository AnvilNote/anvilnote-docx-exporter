# AnvilNote docx-exporter Makefile
# A thin wrapper around pnpm so common workflows share one entry point.
# All comments are written in plain English without parentheses.

# Use pnpm as the package manager for every target.
PM := pnpm

# Forward optional CLI arguments to the exporter entrypoint.
ARGS ?=

# Treat these targets as commands rather than files on disk.
.PHONY: help install dev export build build-desktop start lint typecheck check format test clean reset

# Show this help message when make runs without a target.
.DEFAULT_GOAL := help

help: ## List all available targets with a short description
	@echo "AnvilNote docx-exporter - available make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install all project dependencies from the lockfile
	$(PM) install

dev: ## Run the exporter CLI from source
	$(PM) dev -- $(ARGS)

export: ## Alias for dev, run the exporter CLI with explicit arguments
	@if [ -z "$(ARGS)" ]; then \
		echo "Usage: make export ARGS=\"--input <file.json> --output <file.docx>\""; \
		exit 1; \
	fi
	$(PM) export -- $(ARGS)

build: ## Compile the TypeScript source into dist
	$(PM) build

build-desktop: ## Bundle the exporter for the desktop packaging pipeline
	$(PM) build:desktop

start: ## Run the compiled exporter CLI
	$(PM) start

lint: ## Run ESLint across the whole project
	$(PM) lint

typecheck: ## Run the TypeScript compiler in no-emit mode
	$(PM) exec tsc --noEmit

test: ## Run the Node test runner suite
	$(PM) test

# Run linting and type checking together as a quick quality gate.
check: lint typecheck ## Run lint and typecheck in sequence

format: ## Format the source tree with Prettier
	$(PM) format

clean: ## Remove build output and local caches
	rm -rf dist coverage *.tsbuildinfo

# Wipe installed dependencies on top of the normal clean step.
reset: clean ## Remove node_modules in addition to build output
	rm -rf node_modules
