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

exec gosu node "$@"
