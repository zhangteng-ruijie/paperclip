#!/bin/sh
set -e

# Capture runtime UID/GID from environment variables, defaulting to 1000
PUID=${USER_UID:-1000}
PGID=${USER_GID:-1000}
PAPERCLIP_HOME_DIR=${PAPERCLIP_HOME:-/paperclip}
PAPERCLIP_INSTANCE=${PAPERCLIP_INSTANCE_ID:-default}

# Without root we can neither remap the node user (usermod/groupmod/chown)
# nor switch users (gosu needs CAP_SETUID/CAP_SETGID), so exec directly.
# This covers Kubernetes restricted PodSecurity (runAsNonRoot + runAsUser)
# as well as platforms that assign arbitrary UIDs (e.g. OpenShift); for the
# latter a UID/GID mismatch is unfixable here, so warn instead of letting
# usermod fail cryptically and keep volume-permission issues diagnosable.
if [ "$(id -u)" -ne 0 ]; then
    if [ "$(id -u)" -ne "$PUID" ] || [ "$(id -g)" -ne "$PGID" ]; then
        echo "docker-entrypoint.sh: running unprivileged as $(id -u):$(id -g); cannot remap to requested ${PUID}:${PGID}" >&2
    fi
    exec "$@"
fi

# Adjust the node user's UID/GID if they differ from the runtime request
if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
fi

if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
fi

mkdir -p "$PAPERCLIP_HOME_DIR"

# Ensure the app home is owned by the runtime user BEFORE dropping
# privileges -- not only after a UID/GID remap. A freshly mounted volume
# (Docker named volume, Railway volume, Kubernetes PV) arrives root-owned
# and shadows the image's build-time chown, so with the default UID the old
# remap-only condition dropped privileges onto an unwritable home and the
# server crashed on its first mkdir. The probe is a first-mismatch find
# over the WHOLE tree (uid and gid): a root-owned mount or descendant
# (init containers, backup restores, files written before a remap) is
# found immediately and repaired recursively, a GID-only remap is caught,
# and a fully-correct tree costs one metadata-only walk with no chown.
if [ -d "$PAPERCLIP_HOME_DIR" ] && [ -n "$(find "$PAPERCLIP_HOME_DIR" \( ! -user node -o ! -group node \) -print -quit 2>/dev/null)" ]; then
    chown -R node:node "$PAPERCLIP_HOME_DIR"
fi

# Auto-install pre-built plugins if PAPERCLIP_PREINSTALL_PLUGIN is set
if [ -n "$PAPERCLIP_PREINSTALL_PLUGIN" ]; then
    echo "Auto-installing pre-built plugin: $PAPERCLIP_PREINSTALL_PLUGIN"

    # Wait for server to be ready
    SERVER_URL="${PAPERCLIP_API_URL:-http://localhost:${PORT:-3100}}"
    echo "Waiting for server at $SERVER_URL to be ready..."
    for i in $(seq 1 30); do
        if curl -sf "$SERVER_URL/api/health" > /dev/null 2>&1; then
            echo "Server is ready."
            break
        fi
        if [ $i -eq 30 ]; then
            echo "WARNING: Server did not become ready in 30 seconds, proceeding anyway..."
        fi
        sleep 1
    done

    # Install plugin with API key if provided
    # Use pnpm exec with tsx to run paperclipai CLI
    PLUGIN_INSTALL_CMD="cd /app && ./cli/node_modules/.bin/tsx cli/src/index.ts plugin install $PAPERCLIP_PREINSTALL_PLUGIN --local"
    if [ -n "$PAPERCLIP_API_KEY" ]; then
        PLUGIN_INSTALL_CMD="$PLUGIN_INSTALL_CMD --api-key $PAPERCLIP_API_KEY"
    fi
    if [ -n "$PAPERCLIP_API_URL" ]; then
        PLUGIN_INSTALL_CMD="$PLUGIN_INSTALL_CMD --api-base $PAPERCLIP_API_URL"
    fi

    echo "Running: $PLUGIN_INSTALL_CMD"
    gosu node sh -c "$PLUGIN_INSTALL_CMD" || echo "WARNING: Plugin auto-install failed, continuing..."
fi

exec gosu node "$@"
