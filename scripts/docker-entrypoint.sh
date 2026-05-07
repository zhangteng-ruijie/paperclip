#!/bin/sh
set -e

# Capture runtime UID/GID from environment variables, defaulting to 1000
PUID=${USER_UID:-1000}
PGID=${USER_GID:-1000}
PAPERCLIP_HOME_DIR=${PAPERCLIP_HOME:-/paperclip}
PAPERCLIP_INSTANCE=${PAPERCLIP_INSTANCE_ID:-default}

# Adjust the node user's UID/GID if they differ from the runtime request
# and fix volume ownership only when a remap is needed
changed=0

if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
    changed=1
fi

if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
    changed=1
fi

mkdir -p "$PAPERCLIP_HOME_DIR"

probe_dir="$PAPERCLIP_HOME_DIR/instances/$PAPERCLIP_INSTANCE/data/storage"
needs_ownership_fix=$changed
if ! gosu node sh -c "mkdir -p \"$probe_dir\" && check_dir=\"$probe_dir/.paperclip-write-check.$$\" && mkdir \"\$check_dir\" && rmdir \"\$check_dir\""; then
    needs_ownership_fix=1
fi

if [ "$needs_ownership_fix" = "1" ]; then
    echo "Fixing ownership for $PAPERCLIP_HOME_DIR"
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
    PLUGIN_INSTALL_CMD="paperclipai plugin install $PAPERCLIP_PREINSTALL_PLUGIN --local"
    if [ -n "$PAPERCLIP_API_KEY" ]; then
        PLUGIN_INSTALL_CMD="$PLUGIN_INSTALL_CMD --api-key $PAPERCLIP_API_KEY"
    fi
    if [ -n "$PAPERCLIP_COMPANY_ID" ]; then
        PLUGIN_INSTALL_CMD="$PLUGIN_INSTALL_CMD --company-id $PAPERCLIP_COMPANY_ID"
    fi

    echo "Running: $PLUGIN_INSTALL_CMD"
    gosu node sh -c "$PLUGIN_INSTALL_CMD" || echo "WARNING: Plugin auto-install failed, continuing..."
fi

exec gosu node "$@"
