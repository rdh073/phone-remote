#!/usr/bin/env bash
#
# Bootstraps Headscale on a fresh Debian/Ubuntu server for phone-remote.
# Idempotent: safe to re-run, refuses to clobber existing config unless --force.
#
# What it does:
#   1. Installs the pinned Headscale .deb from GitHub releases
#   2. Renders /etc/headscale/config.yaml from config.yaml.template
#   3. Copies /etc/headscale/acl.json (the policy)
#   4. Enables + starts the systemd service
#   5. Creates the `operator` user
#   6. Mints a 30-day API key (prints it once at the end)
#
# What it doesn't do:
#   - DNS setup (point your hostname at this server beforehand)
#   - Firewall rules (open 80 + 443 to the public internet yourself)
#   - Configure the phone-remote hub (use the printed API key in .env.local)
#
# Usage:
#   sudo ./install.sh \
#     --server-url=https://headscale.example.com \
#     --acme-email=ops@example.com \
#     [--base-domain=phone-remote.lan] \
#     [--headscale-version=0.28.0] \
#     [--force]

set -euo pipefail

# ---- defaults ---------------------------------------------------------------

HEADSCALE_VERSION="${HEADSCALE_VERSION:-0.28.0}"
SERVER_URL=""
ACME_EMAIL=""
BASE_DOMAIN="phone-remote.lan"
FORCE=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- arg parsing ------------------------------------------------------------

usage() {
  cat >&2 <<'EOF'
Usage: sudo ./install.sh [options]

Required:
  --server-url=URL       Public HTTPS URL operator + phones will hit
                         e.g. https://headscale.example.com
  --acme-email=EMAIL     Contact email for Let's Encrypt

Optional:
  --base-domain=DOMAIN   MagicDNS base (default: phone-remote.lan)
  --headscale-version=V  Version to install (default: 0.28.0)
  --force                Overwrite existing /etc/headscale/config.yaml

Environment overrides:
  HEADSCALE_VERSION      Same as --headscale-version
EOF
}

for arg in "$@"; do
  case "$arg" in
    --server-url=*)         SERVER_URL="${arg#*=}";;
    --acme-email=*)         ACME_EMAIL="${arg#*=}";;
    --base-domain=*)        BASE_DOMAIN="${arg#*=}";;
    --headscale-version=*)  HEADSCALE_VERSION="${arg#*=}";;
    --force)                FORCE=1;;
    -h|--help)              usage; exit 0;;
    *) echo "unknown arg: $arg" >&2; usage; exit 2;;
  esac
done

if [[ -z "$SERVER_URL" || -z "$ACME_EMAIL" ]]; then
  echo "error: --server-url and --acme-email are required" >&2
  usage
  exit 2
fi

# Derive TLS hostname from server URL — strip scheme and any trailing path/port.
TLS_HOSTNAME="$(echo "$SERVER_URL" | sed -E 's|^https?://||; s|/.*$||; s|:[0-9]+$||')"

# ---- preflight --------------------------------------------------------------

if [[ $EUID -ne 0 ]]; then
  echo "error: must run as root (sudo ./install.sh ...)" >&2
  exit 1
fi

if ! command -v dpkg >/dev/null; then
  echo "error: this script targets Debian/Ubuntu (dpkg not found)" >&2
  exit 1
fi

for cmd in curl systemctl; do
  if ! command -v "$cmd" >/dev/null; then
    echo "error: missing dependency: $cmd" >&2
    exit 1
  fi
done

# ---- install headscale ------------------------------------------------------

installed_version="$(dpkg-query -W -f='${Version}' headscale 2>/dev/null || true)"
if [[ "$installed_version" == "$HEADSCALE_VERSION" ]]; then
  echo "headscale ${HEADSCALE_VERSION} already installed, skipping"
else
  arch="$(dpkg --print-architecture)"
  deb_url="https://github.com/juanfont/headscale/releases/download/v${HEADSCALE_VERSION}/headscale_${HEADSCALE_VERSION}_linux_${arch}.deb"
  deb_path="/tmp/headscale_${HEADSCALE_VERSION}_linux_${arch}.deb"

  echo "fetching ${deb_url}"
  curl -fsSL -o "$deb_path" "$deb_url"
  echo "installing $deb_path"
  apt-get install -y "$deb_path" || dpkg -i "$deb_path"
  rm -f "$deb_path"
fi

# ---- render config ----------------------------------------------------------

if [[ -f /etc/headscale/config.yaml && $FORCE -ne 1 ]]; then
  echo "/etc/headscale/config.yaml already exists — pass --force to overwrite"
else
  echo "writing /etc/headscale/config.yaml"
  install -d -m 0755 /etc/headscale
  SERVER_URL="$SERVER_URL" \
  ACME_EMAIL="$ACME_EMAIL" \
  TLS_HOSTNAME="$TLS_HOSTNAME" \
  BASE_DOMAIN="$BASE_DOMAIN" \
    envsubst '${SERVER_URL} ${ACME_EMAIL} ${TLS_HOSTNAME} ${BASE_DOMAIN}' \
    < "${SCRIPT_DIR}/config.yaml.template" \
    > /etc/headscale/config.yaml
  chmod 0640 /etc/headscale/config.yaml
fi

# ---- copy ACL ---------------------------------------------------------------

if [[ -f /etc/headscale/acl.json && $FORCE -ne 1 ]]; then
  echo "/etc/headscale/acl.json already exists — pass --force to overwrite"
else
  echo "writing /etc/headscale/acl.json"
  install -m 0644 "${SCRIPT_DIR}/acl.json" /etc/headscale/acl.json
fi

# ---- service ----------------------------------------------------------------

systemctl enable headscale >/dev/null
systemctl restart headscale
sleep 2
if ! systemctl is-active --quiet headscale; then
  echo "error: headscale failed to start — check 'journalctl -u headscale'" >&2
  exit 1
fi
echo "headscale: active"

# ---- operator user ----------------------------------------------------------

if headscale users list 2>/dev/null | awk -F'|' '{print $3}' | grep -qE '^\s*operator\s*$'; then
  echo "user 'operator' already exists, skipping create"
else
  echo "creating user 'operator'"
  headscale users create operator >/dev/null
fi

# ---- mint API key for the phone-remote hub ----------------------------------

echo ""
echo "minting 30-day API key for the hub:"
api_key="$(headscale apikeys create --expiration 30d 2>/dev/null | tail -1)"
operator_id="$(headscale users list 2>/dev/null | awk -F'|' '/operator/ {gsub(/^\s+|\s+$/,"",$1); print $1; exit}')"

cat <<EOF

  ----------------------------------------------------------------
  Headscale is up at: $SERVER_URL
  Drop these into the phone-remote hub's .env.local (and restart):

    HEADSCALE_URL=$SERVER_URL
    HEADSCALE_API_KEY=$api_key
    HEADSCALE_USER_ID=$operator_id

  ----------------------------------------------------------------
  Next steps:
  - Make sure DNS for $TLS_HOSTNAME points here, and ports 80 + 443
    are open to the public internet (Let's Encrypt HTTP-01 needs :80).
  - The hub itself must also join this tailnet to reach phones.
    On the hub box:
        sudo headscale --user $operator_id preauthkeys create --tags tag:hub
    then on the hub:
        tailscale up --login-server=$SERVER_URL --auth-key=<key>
  ----------------------------------------------------------------
EOF
