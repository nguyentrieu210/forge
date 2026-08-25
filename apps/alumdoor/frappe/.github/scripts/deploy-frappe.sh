#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
SOCKET=/var/run/docker.sock
APP=alumdoor

if [ ! -S "$SOCKET" ]; then
  echo "ERROR: Docker socket is not mounted at $SOCKET"
  exit 42
fi

DOCKER_BIN="$(command -v docker || true)"
if [ -z "$DOCKER_BIN" ]; then
  TOOL_DIR="$ROOT/.runner-tools/docker"
  mkdir -p "$TOOL_DIR"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) docker_arch=x86_64 ;;
    aarch64|arm64) docker_arch=aarch64 ;;
    *) echo "Unsupported architecture: $arch"; exit 43 ;;
  esac

  base="https://download.docker.com/linux/static/stable/$docker_arch"
  tarball="$(curl -fsSL "$base/" | grep -oE 'docker-[0-9]+\.[0-9]+\.[0-9]+\.tgz' | sort -Vu | tail -1)"
  [ -n "$tarball" ] || { echo "Unable to discover Docker CLI archive"; exit 44; }
  echo "Installing runner-local Docker CLI: $tarball"
  curl -fsSL "$base/$tarball" -o "$TOOL_DIR/docker.tgz"
  rm -rf "$TOOL_DIR/unpack"
  mkdir -p "$TOOL_DIR/unpack"
  tar -xzf "$TOOL_DIR/docker.tgz" -C "$TOOL_DIR/unpack"
  DOCKER_BIN="$TOOL_DIR/unpack/docker/docker"
fi

"$DOCKER_BIN" version

echo "=== Running containers ==="
"$DOCKER_BIN" ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'

primary=""
BENCH=""
mapfile -t all_containers < <("$DOCKER_BIN" ps --format '{{.Names}}')

for c in "${all_containers[@]}"; do
  candidate="$("$DOCKER_BIN" exec "$c" sh -lc '
    for p in \
      /workspace/development/frappe-bench \
      /workspace/frappe-bench \
      /home/frappe/frappe-bench \
      /home/frappe/bench \
      /frappe-bench; do
      if [ -d "$p/apps" ] && [ -d "$p/sites" ]; then
        printf "%s" "$p"
        exit 0
      fi
    done
    find /workspace /home /opt /srv -maxdepth 5 -type d -name frappe-bench 2>/dev/null | while read -r p; do
      if [ -d "$p/apps" ] && [ -d "$p/sites" ]; then
        printf "%s" "$p"
        break
      fi
    done
  ' 2>/dev/null | tr -d '\r' | head -n1)"

  if [ -n "$candidate" ]; then
    primary="$c"
    BENCH="$candidate"
    break
  fi
done

if [ -z "$primary" ] || [ -z "$BENCH" ]; then
  echo "ERROR: no running Frappe bench container/path found"
  echo "=== devcontainer-frappe-1 filesystem hints ==="
  "$DOCKER_BIN" exec devcontainer-frappe-1 sh -lc 'pwd; ls -la /workspace 2>/dev/null || true; ls -la /workspace/development 2>/dev/null || true; find /workspace /home -maxdepth 5 -type d -name frappe-bench 2>/dev/null | head -20' 2>&1 || true
  exit 45
fi

echo "Frappe container: $primary"
echo "Frappe bench: $BENCH"

echo "=== Bench info ==="
"$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && (bench version || true) && echo '--- apps ---' && ls -1 apps && echo '--- sites ---' && find sites -mindepth 2 -maxdepth 2 -name site_config.json -print"

owner="$("$DOCKER_BIN" exec -u 0 "$primary" sh -lc "stat -c '%u:%g' '$BENCH'" | tr -d '\r')"

echo "=== Sync Alumdoor app into Frappe bench ==="
"$DOCKER_BIN" exec -u 0 "$primary" sh -lc 'rm -rf /tmp/alumdoor-deploy && mkdir -p /tmp/alumdoor-deploy'
tar \
  --exclude='.git' \
  --exclude='.runner-tools' \
  --exclude='.github/runner-command-output.log' \
  -C "$ROOT" -cf - . | "$DOCKER_BIN" exec -i -u 0 "$primary" tar -C /tmp/alumdoor-deploy -xf -

"$DOCKER_BIN" exec -u 0 "$primary" sh -lc "
  set -e
  rm -rf '$BENCH/apps/$APP'
  mkdir -p '$BENCH/apps/$APP'
  cp -a /tmp/alumdoor-deploy/. '$BENCH/apps/$APP/'
  chown -R '$owner' '$BENCH/apps/$APP'
  rm -rf /tmp/alumdoor-deploy
"

"$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && ./env/bin/pip install --no-deps -e 'apps/$APP'"
"$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && grep -qxF '$APP' sites/apps.txt || echo '$APP' >> sites/apps.txt"

mapfile -t sites < <("$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && find sites -mindepth 2 -maxdepth 2 -name site_config.json -printf '%h\n' | sed 's#^sites/##'" | tr -d '\r')
[ "${#sites[@]}" -gt 0 ] || { echo "ERROR: no Frappe sites found"; exit 47; }

for site in "${sites[@]}"; do
  echo "=== Deploy site: $site ==="
  installed_apps="$("$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && bench --site '$site' list-apps" | tr -d '\r')"
  if printf '%s\n' "$installed_apps" | grep -Eq "(^|[[:space:]])$APP([[:space:]]|$)"; then
    echo "$APP already installed; migrating"
    "$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && bench --site '$site' migrate"
  else
    echo "Installing $APP"
    "$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && bench --site '$site' install-app '$APP'"
  fi
  "$DOCKER_BIN" exec "$primary" sh -lc "cd '$BENCH' && bench --site '$site' clear-cache && bench --site '$site' clear-website-cache"
done

echo "=== Restart Frappe container ==="
"$DOCKER_BIN" restart "$primary"

echo "DEPLOY_OK app=$APP sites=${sites[*]} container=$primary bench=$BENCH"
