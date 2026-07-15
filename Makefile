.PHONY: lint test build gc ci hooks

lint:
	node scripts/lint.mjs

test:
	node --check app.js
	node --test tests/architecture/boundary.test.mjs

build:
	@test -f index.html && test -f styles.css && test -f manifest.webmanifest

gc:
	node scripts/gc/run-gc.mjs

hooks:
	git config core.hooksPath .githooks

ci: lint test build
