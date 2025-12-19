# ElectionLens Automation Makefile
# Run 'make help' to see available commands

.PHONY: install dev build test test-watch test-coverage test-ui lint lint-fix format format-check clean ci help setup-hooks validate check quick-check

# Colors for terminal output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Default target
help:
	@echo ""
	@echo "$(GREEN)ElectionLens - Available Commands$(NC)"
	@echo "════════════════════════════════════════════════════════════════"
	@echo ""
	@echo "$(YELLOW)Setup & Development:$(NC)"
	@echo "  make install        Install dependencies (npm ci)"
	@echo "  make dev            Start development server with hot reload"
	@echo "  make build          Build for production"
	@echo "  make clean          Clean build artifacts and caches"
	@echo "  make setup-hooks    Setup git hooks (husky)"
	@echo ""
	@echo "$(YELLOW)Testing:$(NC)"
	@echo "  make test           Run tests once"
	@echo "  make test-watch     Run tests in watch mode"
	@echo "  make test-coverage  Run tests with coverage report"
	@echo "  make test-ui        Open Vitest UI in browser"
	@echo "  make test-related   Run tests related to changed files"
	@echo ""
	@echo "$(YELLOW)Code Quality:$(NC)"
	@echo "  make lint           Run ESLint"
	@echo "  make lint-fix       Run ESLint with auto-fix"
	@echo "  make format         Format code with Prettier"
	@echo "  make format-check   Check formatting without changes"
	@echo ""
	@echo "$(YELLOW)Validation & CI:$(NC)"
	@echo "  make check          Full check (lint + test + build)"
	@echo "  make quick-check    Quick validation (lint + test)"
	@echo "  make validate       Validate (lint + test)"
	@echo "  make ci             Full CI pipeline with coverage"
	@echo ""
	@echo "$(YELLOW)Shortcuts:$(NC)"
	@echo "  make t              Alias for 'make test'"
	@echo "  make tw             Alias for 'make test-watch'"
	@echo "  make tc             Alias for 'make test-coverage'"
	@echo "  make l              Alias for 'make lint'"
	@echo "  make lf             Alias for 'make lint-fix'"
	@echo "  make f              Alias for 'make format'"
	@echo ""

# ============================================================
# Setup & Development
# ============================================================

# Install dependencies
install:
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm ci
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

# Development server
dev:
	@echo "$(GREEN)Starting development server...$(NC)"
	npm run dev

# Production build
build:
	@echo "$(GREEN)Building for production...$(NC)"
	npm run build
	@echo "$(GREEN)✓ Build complete$(NC)"

# Clean build artifacts
clean:
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	npm run clean
	rm -rf .husky/_
	@echo "$(GREEN)✓ Clean complete$(NC)"

# Setup git hooks
setup-hooks:
	@echo "$(GREEN)Setting up git hooks...$(NC)"
	npm run prepare
	chmod +x .husky/pre-commit .husky/pre-push 2>/dev/null || true
	@echo "$(GREEN)✓ Git hooks installed$(NC)"

# ============================================================
# Testing
# ============================================================

# Run tests once
test:
	@echo "$(GREEN)Running tests...$(NC)"
	npm run test:run

# Shortcut alias
t: test

# Watch mode tests
test-watch:
	@echo "$(GREEN)Running tests in watch mode...$(NC)"
	npm run test:watch

# Shortcut alias
tw: test-watch

# Coverage report
test-coverage:
	@echo "$(GREEN)Running tests with coverage...$(NC)"
	npm run test:coverage
	@echo ""
	@echo "$(GREEN)✓ Coverage report: coverage/index.html$(NC)"

# Shortcut alias
tc: test-coverage

# Vitest UI
test-ui:
	@echo "$(GREEN)Opening Vitest UI...$(NC)"
	npm run test:ui

# Run tests related to changed files
test-related:
	@echo "$(GREEN)Running tests for changed files...$(NC)"
	npx vitest related --run

# ============================================================
# Code Quality
# ============================================================

# Lint
lint:
	@echo "$(GREEN)Running ESLint...$(NC)"
	npm run lint

# Shortcut alias
l: lint

# Lint and fix
lint-fix:
	@echo "$(GREEN)Running ESLint with auto-fix...$(NC)"
	npm run lint:fix
	@echo "$(GREEN)✓ Lint issues fixed$(NC)"

# Shortcut alias
lf: lint-fix

# Format code
format:
	@echo "$(GREEN)Formatting code with Prettier...$(NC)"
	npm run format
	@echo "$(GREEN)✓ Code formatted$(NC)"

# Shortcut alias
f: format

# Check formatting
format-check:
	@echo "$(GREEN)Checking code formatting...$(NC)"
	npm run format:check

# ============================================================
# Validation & CI
# ============================================================

# Quick validation (no coverage, no build)
quick-check:
	@echo "$(GREEN)Running quick validation...$(NC)"
	@echo ""
	@echo "$(YELLOW)Step 1/2: Linting...$(NC)"
	npm run lint
	@echo ""
	@echo "$(YELLOW)Step 2/2: Testing...$(NC)"
	npm run test:run
	@echo ""
	@echo "$(GREEN)✓ Quick check passed!$(NC)"

# Validate (lint + test)
validate:
	@echo "$(GREEN)Running validation...$(NC)"
	npm run validate
	@echo "$(GREEN)✓ Validation passed!$(NC)"

# Full check (lint + test + build)
check:
	@echo "$(GREEN)Running full check...$(NC)"
	@echo ""
	@echo "$(YELLOW)Step 1/3: Linting...$(NC)"
	npm run lint
	@echo ""
	@echo "$(YELLOW)Step 2/3: Testing...$(NC)"
	npm run test:run
	@echo ""
	@echo "$(YELLOW)Step 3/3: Building...$(NC)"
	npm run build
	@echo ""
	@echo "$(GREEN)════════════════════════════════════════$(NC)"
	@echo "$(GREEN)✓ All checks passed!$(NC)"
	@echo "$(GREEN)════════════════════════════════════════$(NC)"

# Full CI pipeline with coverage
ci:
	@echo "$(GREEN)Running CI pipeline...$(NC)"
	@echo ""
	@echo "$(YELLOW)Step 1/3: Linting...$(NC)"
	npm run lint
	@echo ""
	@echo "$(YELLOW)Step 2/3: Testing with coverage...$(NC)"
	npm run test:coverage
	@echo ""
	@echo "$(YELLOW)Step 3/3: Building...$(NC)"
	npm run build
	@echo ""
	@echo "$(GREEN)════════════════════════════════════════$(NC)"
	@echo "$(GREEN)✓ CI pipeline complete!$(NC)"
	@echo "$(GREEN)════════════════════════════════════════$(NC)"

# ============================================================
# Utility Targets
# ============================================================

# Show test coverage summary
coverage-summary:
	@echo "$(GREEN)Test Coverage Summary:$(NC)"
	@cat coverage/coverage-summary.json 2>/dev/null | npx json -a -e 'console.log(JSON.stringify(this, null, 2))' || echo "Run 'make test-coverage' first"

# Open coverage report in browser
coverage-open:
	@echo "$(GREEN)Opening coverage report...$(NC)"
	open coverage/index.html 2>/dev/null || xdg-open coverage/index.html 2>/dev/null || echo "Coverage report: coverage/index.html"

# Check dependencies for updates
deps-check:
	@echo "$(GREEN)Checking for dependency updates...$(NC)"
	npx npm-check-updates

# Update dependencies interactively
deps-update:
	@echo "$(GREEN)Interactive dependency update...$(NC)"
	npx npm-check-updates -i

# ============================================================
# Docker (optional, for containerized testing)
# ============================================================

docker-build:
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t election-lens .

docker-test:
	@echo "$(GREEN)Running tests in Docker...$(NC)"
	docker run --rm election-lens npm run test:run
