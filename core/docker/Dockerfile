# syntax=docker/dockerfile:1.7
#
# epsilon/computer — sandbox thin image (fast rebuild on every push)
#
# Inherits OS/tools/libs from Dockerfile.base (~monthly rebuild, ~20-25 min).
# This file: epsilon-master source + bun install + global CLIs (~5-8 min).
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │                      PERSISTENCE CONTRACT                              │
# │                                                                        │
# │  /workspace/   = PERSISTENT  (Docker volume, survives everything)      │
# │  /opt/         = AVAILABLE   (user/system, container layer)            │
# │  /ephemeral/   = SHIPPED     (Epsilon runtime, REPLACED on update)     │
# │  /run/s6/      = TMPFS       (rebuilt from /workspace on boot)         │
# │                                                                        │
# │  Rule: ALL user state MUST live under /workspace/.                     │
# │  Rule: NEVER store runtime state in /ephemeral/. It gets replaced.     │
# │  Rule: /run/s6/container_environment/ is rebuilt from encrypted        │
# │        secrets at boot via 97-secrets-to-s6-env.sh.                    │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Build cmd (run from repo root):
#   docker build -f core/docker/Dockerfile \
#     --build-arg BASE_IMAGE=ghcr.io/deptrai/computer:base-latest \
#     --build-arg SANDBOX_VERSION=$(git describe --tags --always) \
#     -t ghcr.io/deptrai/computer:next-$(git rev-parse --short HEAD) .
#

ARG BASE_IMAGE=ghcr.io/deptrai/computer:base-latest
FROM ${BASE_IMAGE}

ARG SANDBOX_VERSION=0.0.0-dev

# Global binary versions — pinned here, bumped manually
ARG OPENCODE_VERSION=1.14.28
ARG AGENT_BROWSER_VERSION=0.19.0
ARG OCX_VERSION=2.0.0

# ── Services (s6-rc.d longrun) ──────────────────────────────────────────────
COPY core/s6-services/ /etc/s6-overlay/s6-rc.d/
RUN for svc in svc-epsilon-master svc-opencode-serve svc-opencode-state-sync \
        svc-chromium-persistent svc-agent-browser-session svc-agent-browser-viewer \
        svc-static-web svc-lss-sync svc-sshd svc-docker svc-port-shim; do \
        touch "/etc/s6-overlay/s6-rc.d/user/contents.d/${svc}"; \
    done \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-*/run \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-*/finish 2>/dev/null || true

# ── Service scripts (baked-in JS — no more /tmp/ temp files) ────────────────
COPY core/services/ /ephemeral/services/

# Silence spammy base-image desktop finish script
RUN printf '#!/bin/bash\nPID_FILE="/de-pid"\nif [ ! -r "$PID_FILE" ]; then exit 0; fi\nPARENT_PID=$(cat "$PID_FILE")\nif [ -z "$PARENT_PID" ]; then rm -f "$PID_FILE"; exit 0; fi\nPIDS=$(pstree -p "$PARENT_PID" 2>/dev/null | grep -o "([0-9]\\+)" | grep -o "[0-9]\\+" | grep -v "^${PARENT_PID}$")\n[ -n "$PIDS" ] && echo "$PIDS" | xargs kill -TERM -- 2>/dev/null && sleep 1\nrm -f "$PID_FILE"\nexit 0\n' > /etc/s6-overlay/s6-rc.d/svc-de/finish \
    && chmod +x /etc/s6-overlay/s6-rc.d/svc-de/finish

# ── Container init scripts ───────────────────────────────────────────────────
RUN mkdir -p /custom-cont-init.d
COPY core/init-scripts/95-egress-whitelist.sh /custom-cont-init.d/95-egress-whitelist
COPY core/init-scripts/95-setup-sshd.sh /custom-cont-init.d/95-setup-sshd
COPY core/init-scripts/97-secrets-to-s6-env.sh /custom-cont-init.d/97-secrets-to-s6-env
COPY core/init-scripts/epsilon-env-setup.sh /custom-cont-init.d/98-epsilon-env
COPY core/init-scripts/99-restore-packages.sh /custom-cont-init.d/99-restore-packages
COPY core/init-scripts/99-fix-opencode-ownership.sh /custom-cont-init.d/zz-fix-opencode-ownership
RUN chmod +x /custom-cont-init.d/*

# ── Persistent package wrapper (apt-persist) ────────────────────────────────
COPY core/scripts/apt-persist /usr/local/bin/apt-persist
RUN chmod +x /usr/local/bin/apt-persist

COPY core/scripts/epsilon-opencode-state /usr/local/bin/epsilon-opencode-state
RUN chmod +x /usr/local/bin/epsilon-opencode-state

# ── Docker-in-Docker readiness helper ───────────────────────────────────────
# Polls `docker info` until dockerd is reachable. Use from anywhere that
# needs to run `docker ...` commands early in the boot sequence.
COPY core/scripts/docker-wait-ready /usr/local/bin/docker-wait-ready
RUN chmod +x /usr/local/bin/docker-wait-ready

# ── E2E test scripts ────────────────────────────────────────────────────────
COPY core/tests/ /ephemeral/tests/
RUN chmod +x /ephemeral/tests/*.sh 2>/dev/null || true

# ── Copy source packages to build staging area ──────────────────────────────
# All sandbox packages are now consolidated inside core/epsilon-master/
#   epsilon-master/opencode/   — OpenCode config dir (agents, skills, plugins, tools)
#   epsilon-master/channels/   — CLIs: ktelegram, kslack, kchannel, kconnectors, kpipedream
#   epsilon-master/triggers/   — Cron + webhook triggers
COPY core/epsilon-master  /opt/build/epsilon-master
COPY core/s6-services/svc-agent-browser-viewer/index.html /opt/build/browser-viewer/index.html

# ── Build sandbox runtime ────────────────────────────────────────────────────
RUN set -eo pipefail && echo "[docker] Building sandbox runtime v${SANDBOX_VERSION}..." && \
    \
    # ── 1. epsilon-master (single bun install — includes triggers, channels, opencode deps) ── \
    mkdir -p /ephemeral/epsilon-master && \
    rsync -a --exclude=node_modules --exclude=bun.lock --exclude=.git \
      /opt/build/epsilon-master/ /ephemeral/epsilon-master/ && \
    cd /ephemeral/epsilon-master && bun install 2>&1 && \
    test -d /ephemeral/epsilon-master/node_modules && \
    chmod +x /ephemeral/epsilon-master/scripts/*.sh 2>/dev/null || true && \
    echo "[docker] epsilon-master: bun install OK (includes triggers, channel CLIs, opencode)" && \
    \
    # ── 1b. Install Epsilon CLI wrappers into /usr/local/bin ── \
    /ephemeral/epsilon-master/scripts/install-channel-clis.sh && \
    \
    # ── 2. skills shipped in-tree under skills/EPSILON-system/ (recursive discovery) ── \
    echo "[docker] skills: agent-tunnel, agent-browser, presentations in /ephemeral/epsilon-master/opencode/skills/EPSILON-system/" && \
    \
    # ── 4. Agent browser viewer ── \
    mkdir -p /ephemeral/agent-browser-viewer && \
    rsync -a --delete /opt/build/browser-viewer/ /ephemeral/agent-browser-viewer/ && \
    \
    # ── 5. Version metadata ── \
    mkdir -p /ephemeral/metadata && \
    printf '{"version":"%s","updatedAt":"%s"}\n' "${SANDBOX_VERSION}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /ephemeral/metadata/.version && \
    \
    # ── 6. Global CLI binaries (direct install, no intermediate package.json) ── \
    npm install -g --no-audit --no-fund \
      "opencode-ai@${OPENCODE_VERSION}" \
      "agent-browser@${AGENT_BROWSER_VERSION}" \
      "ocx@${OCX_VERSION}" 2>&1 && \
    command -v opencode >/dev/null && \
    command -v agent-browser >/dev/null && \
    command -v ocx >/dev/null && \
    echo "[docker] Global binaries: opencode=$(opencode --version 2>/dev/null || echo '?'), agent-browser, ocx" && \
    \
    # ── 7. Binary patches (MUST run after npm install -g opencode-ai) ── \
    bash /ephemeral/epsilon-master/opencode/patches/apply.sh && \
    \
    # ── 8. Fix ownership ── \
    # CRITICAL: Use abc:abc (UID 911) — NOT 1000:1000. The linuxserver base image \
    # creates user abc with UID 911. All runtime processes (opencode, epsilon-master) \
    # run as abc via s6-setuidgid. Using 1000 causes EACCES everywhere at runtime. \
    chown -R abc:abc /ephemeral \
      2>/dev/null || true && \
    \
    # ── 9. Cleanup ── \
    rm -rf /opt/build /root/.npm/_cacache /root/.npm/_logs 2>/dev/null || true && \
    echo "[docker] Build complete."

# ── Startup entrypoint ────────────────────────────────────────────────────────
COPY core/startup.sh /ephemeral/startup.sh
COPY core/daytona-start.sh /usr/local/bin/epsilon-daytona-start
RUN chmod +x /ephemeral/startup.sh /usr/local/bin/epsilon-daytona-start

# ── Runtime persistence — user-installed packages survive restarts ────────────
# These ENVs are set AFTER the build step intentionally. During build, npm/pip
# use system paths (/usr/local/) so core tools are baked into the image layer.
# At runtime, these redirect user installs to /workspace/ (the persistent volume).
#
# pip:    PYTHONUSERBASE + PIP_USER=1  → /workspace/.local/
# npm -g: NPM_CONFIG_PREFIX           → /workspace/.npm-global/
# apt:    apt-persist wrapper         → manifest in /workspace/.epsilon/packages/
#
ENV PYTHONUSERBASE=/workspace/.local
ENV PIP_USER=1
ENV NPM_CONFIG_PREFIX=/workspace/.npm-global
ENV NODE_PATH="/usr/local/lib/node_modules:${NODE_PATH}"
ENV PATH="/workspace/.npm-global/bin:/workspace/.local/bin:${PATH}"

# ── Environment ───────────────────────────────────────────────────────────────
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV AGENT_BROWSER_SESSION=epsilon
ENV AGENT_BROWSER_PRIMARY_SESSION=epsilon
ENV AGENT_BROWSER_HEADED=0
ENV AGENT_BROWSER_SOCKET_DIR=/dev/shm/agent-browser
ENV AGENT_BROWSER_ARGS="--no-sandbox,--disable-gpu,--disable-dev-shm-usage,--disable-infobars,--disable-blink-features=AutomationControlled,--disable-features=VizDisplayCompositor"
ENV AGENT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
ENV AGENT_BROWSER_IDLE_TIMEOUT_MS=0
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV OPENCODE_CONFIG_DIR=/ephemeral/epsilon-master/opencode
ENV EPSILON_PERSISTENT_ROOT=/persistent
ENV OPENCODE_STORAGE_BASE=/persistent/opencode
ENV OPENCODE_SHADOW_STORAGE_BASE=/persistent/opencode-shadow
ENV EPSILON_OPENCODE_ARCHIVE_DIR=/persistent/opencode-archive
ENV EPSILON_OPENCODE_CACHE_DIR=/persistent/opencode-cache
ENV AUTH_JSON_PATH=/persistent/opencode/auth.json
ENV SECRET_FILE_PATH=/persistent/secrets/.secrets.json
ENV SALT_FILE_PATH=/persistent/secrets/.salt
ENV ENCRYPTION_KEY_PATH=/persistent/secrets/.encryption-key
ENV LSS_DIR=/persistent/lss
ENV SANDBOX_VERSION=${SANDBOX_VERSION}

# ── Docker-in-Docker defaults ────────────────────────────────────────────────
# DOCKER_HOST is the unix socket dockerd creates inside this container. Set
# it globally so every shell and every `docker` invocation inside the sandbox
# hits the DinD daemon, not the host socket (which isn't mounted anyway).
ENV DOCKER_HOST=unix:///var/run/docker.sock

# ── Playwright — use system Chromium (no separate download needed) ───────────
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ── Desktop config — Selkies streaming ───────────────────────────────────────
# Ports
ENV CUSTOM_PORT=6080
ENV CUSTOM_HTTPS_PORT=6081
ENV TITLE="Epsilon Computer"
# Resolution: auto-adapt to iframe/browser size (no manual lock)
# Display: standard 100% UI scaling (96 DPI)
# Encoder: x264enc locked, 60 FPS locked, CRF 18 (near-lossless), full 4:4:4 color
ENV SELKIES_ENCODER="x264enc"
ENV SELKIES_FRAMERATE="60"
ENV SELKIES_H264_CRF="18"
ENV SELKIES_H264_FULLCOLOR=true
ENV SELKIES_USE_CSS_SCALING=false
# UI scaling: 100% DPI (standard)
ENV SELKIES_SCALING_DPI="96"
# Paint-overs: high quality for static scenes (sharp text/UI)
ENV SELKIES_USE_PAINT_OVER_QUALITY=true
ENV SELKIES_PAINT_OVER_JPEG_QUALITY="90"
ENV SELKIES_H264_PAINTOVER_CRF="12"
# Cursors: CSS cursors for lower latency
ENV SELKIES_USE_BROWSER_CURSORS=true


EXPOSE 22 3456 6080 6081 3210 8000 9222 9223 9224

ENTRYPOINT ["/ephemeral/startup.sh"]
