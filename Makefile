.PHONY: sandbox-token

sandbox-token:
	@mkdir -p secrets
	@token="$$(grep -E '^INTERNAL_SERVICE_KEY=' apps/api/.env | tail -n 1 | cut -d= -f2-)"; \
	if [ -z "$$token" ]; then \
		echo "INTERNAL_SERVICE_KEY not found in apps/api/.env"; \
		exit 1; \
	fi; \
	printf "%s" "$$token" > secrets/sandbox-token.txt; \
	echo "wrote secrets/sandbox-token.txt"
