.PHONY: sandbox-token sandbox-token-check

sandbox-token:
	@mkdir -p secrets
	@token="$$(grep -E '^INTERNAL_SERVICE_KEY=' apps/api/.env | tail -n 1 | cut -d= -f2-)"; \
	if [ -z "$$token" ]; then \
		echo "INTERNAL_SERVICE_KEY not found in apps/api/.env"; \
		exit 1; \
	fi; \
	printf "%s" "$$token" > secrets/sandbox-token.txt; \
	echo "wrote secrets/sandbox-token.txt"

# Check that secrets/sandbox-token.txt matches apps/api/.env INTERNAL_SERVICE_KEY.
# Use as a pre-up hook (e.g. `make sandbox-token-check && docker compose up`) to
# fail fast when .env was rotated but secret file wasn't regenerated.
sandbox-token-check:
	@if [ ! -f secrets/sandbox-token.txt ]; then \
		echo "[bootstrap] secrets/sandbox-token.txt missing — run 'make sandbox-token'"; \
		exit 1; \
	fi; \
	env_token="$$(grep -E '^INTERNAL_SERVICE_KEY=' apps/api/.env | tail -n 1 | cut -d= -f2-)"; \
	file_token="$$(cat secrets/sandbox-token.txt)"; \
	if [ "$$env_token" != "$$file_token" ]; then \
		echo "[bootstrap] INTERNAL_SERVICE_KEY .env mismatch — run 'make sandbox-token'"; \
		exit 1; \
	fi

