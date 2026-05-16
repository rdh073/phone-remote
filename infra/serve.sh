#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4000}"

if ! command -v tailscale >/dev/null; then
  echo "tailscale binary not found. Install first:" >&2
  echo "  curl -fsSL https://tailscale.com/install.sh | sh" >&2
  echo "  sudo tailscale up --ssh --advertise-tags=tag:hub" >&2
  exit 1
fi

sudo tailscale serve --bg --https=443 "http://127.0.0.1:${PORT}"
sudo tailscale serve status
