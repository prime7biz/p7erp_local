#!/bin/sh
# Backend container entrypoint (API, Celery worker and Celery beat all use it).
#
# What it does when the container starts as root and RUN_AS_NON_ROOT is true (the default):
#   1. Makes sure the folders the app writes to (uploads in /app/media, the beat schedule file
#      that lives there in production, and /app/backups) belong to the "app" user. Volumes created
#      by older root-only images are fixed once; later restarts only check and skip.
#   2. Runs the real command (uvicorn / alembic / celery ...) as the "app" user via setpriv.
#
# RUN_AS_NON_ROOT=false keeps the old behaviour (everything runs as root).
# If a folder still is not writable for "app" after the fix, it logs a WARNING and runs as root
# so uploads and beat never break on the live server.
set -eu

APP_USER="app"

log() {
  echo "docker-entrypoint: $*" >&2
}

case "$(printf '%s' "${RUN_AS_NON_ROOT:-true}" | tr '[:upper:]' '[:lower:]')" in
  0 | false | no | off)
    exec "$@"
    ;;
esac

# Already unprivileged (e.g. `docker run --user 10001`): nothing to fix, nothing to drop.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

if ! APP_UID="$(id -u "$APP_USER" 2>/dev/null)"; then
  log "WARNING: user '$APP_USER' does not exist in this image; running as root"
  exec "$@"
fi
APP_GID="$(id -g "$APP_USER")"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

# MEDIA_ROOT / BACKUP_DIR are the same settings backend/app/config.py reads.
# Relative paths resolve against the working directory (/app), exactly like the app does.
WRITABLE_DIRS="${MEDIA_ROOT:-/app/media} ${BACKUP_DIR:-/app/backups}"

all_writable=1
for dir in $WRITABLE_DIRS; do
  case "$dir" in
    / | /app | /usr | /usr/* | /etc | /etc/* | /bin | /bin/* | /lib | /lib/*)
      log "WARNING: refusing to change ownership of system path '$dir'"
      continue
      ;;
  esac
  mkdir -p "$dir" 2>/dev/null || true
  # Only walk the whole tree when something is owned by someone else (e.g. root-owned files
  # from an older image or from `docker compose exec` as root).
  if [ -n "$(find "$dir" \( ! -user "$APP_UID" -o ! -group "$APP_GID" \) -print -quit 2>/dev/null)" ]; then
    log "fixing ownership of $dir for $APP_USER ($APP_UID:$APP_GID)"
    started="$(date +%s)"
    chown -R "$APP_UID:$APP_GID" "$dir" || log "WARNING: chown failed for $dir"
    log "ownership of $dir fixed in $(($(date +%s) - started))s"
  fi
  if ! setpriv --reuid="$APP_UID" --regid="$APP_GID" --init-groups test -w "$dir"; then
    log "WARNING: $dir is not writable for $APP_USER"
    all_writable=0
  fi
done

if [ "$all_writable" != "1" ]; then
  log "WARNING: falling back to root so uploads and Celery beat keep working"
  exec "$@"
fi

export HOME="$APP_HOME" USER="$APP_USER" LOGNAME="$APP_USER"
exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --init-groups -- "$@"
