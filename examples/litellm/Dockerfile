# Tiny image that bakes the LiteLLM proxy config in at build time so it works
# on every Docker host without bind-mount permission games (Docker Desktop on
# macOS, in particular, refuses to mount from ~/Desktop by default).
#
# Override the baked config by setting compose `command:` to
#   ["--config", "/your/path.yaml", ...] and bind-mounting your own file in.
FROM ghcr.io/berriai/litellm:main-stable
COPY litellm-config.yaml /app/config.yaml
