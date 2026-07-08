# Makefile

CODEX_SESSION := 019f3eaa-c5f0-76b2-bc49-d5a7aef82fa9

.PHONY: codex resume new status build gs

codex: resume

resume:
	codex resume $(CODEX_SESSION)

new:
	codex

last:
	codex resume --last

status:
	git status --short --branch

build:
	npm run build

gs:
	git status --short --branchs