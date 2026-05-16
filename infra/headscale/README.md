# Headscale bootstrap for phone-remote

Reproducible self-hosted Tailscale coordination server. Fresh Debian / Ubuntu
VPS → working `tag:hub → tag:phone:5555,30000-65535` tailnet in one shot.

## Files

| File | Purpose |
|---|---|
| `install.sh` | Idempotent installer. Drops binary, config, ACL, mints API key. |
| `config.yaml.template` | Headscale config with `${SERVER_URL}`, `${ACME_EMAIL}`, `${TLS_HOSTNAME}`, `${BASE_DOMAIN}` placeholders. |
| `acl.json` | Policy used by the hub: only `tag:hub → tag:phone:5555,30000-65535`. |

## Usage

On a fresh Debian/Ubuntu server with a public IP and a DNS name pointing at
it (or use `sslip.io` if you don't care about the hostname):

```bash
git clone <this-repo>
cd phone-remote/infra/headscale
sudo ./install.sh \
  --server-url=https://headscale.example.com \
  --acme-email=ops@example.com \
  --base-domain=phone-remote.lan
```

What the script does, in order:

1. Downloads the pinned Headscale `.deb` (v0.28.0 by default) from GitHub Releases
2. `dpkg -i` the package
3. Renders `/etc/headscale/config.yaml` from `config.yaml.template`
4. Installs `/etc/headscale/acl.json`
5. `systemctl enable --now headscale`
6. `headscale users create operator` (idempotent)
7. `headscale apikeys create --expiration 30d`
8. Prints the three env-vars the phone-remote hub needs (`HEADSCALE_URL`,
   `HEADSCALE_API_KEY`, `HEADSCALE_USER_ID`)

## What the script does NOT do

These are outside the script's scope on purpose — pick how you want to handle each:

- **DNS** — point your hostname at the server *before* running (Let's Encrypt
  HTTP-01 will probe it). With `sslip.io` you skip this: pass
  `--server-url=https://1.2.3.4.sslip.io`.
- **Firewall** — open `:80` and `:443` to the public internet. `:80` is
  required for ACME challenges. `ufw allow 80,443/tcp` if you use ufw.
- **Hub joining the tailnet** — the phone-remote hub box also needs Tailscale
  installed and joined as `tag:hub`. The script prints the exact commands at
  the end. The hub *coordinator process* doesn't need to be on insta itself;
  any box that can mint preauth keys via the REST API works, but a box that
  needs to actually `adb connect <100.x.y.z>:5555` *must* be on the tailnet.

## After install: re-running, upgrading, debugging

```bash
# Re-render config (eg. changed BASE_DOMAIN); preserves cert + db state.
sudo ./install.sh --server-url=... --acme-email=... --force

# Reload ACL after editing /etc/headscale/acl.json (no restart needed).
sudo systemctl reload headscale

# Verify policy loaded.
sudo journalctl -u headscale -n 20 --no-pager | grep -i policy

# Mint a phone preauth key (one-shot, used by the hub when the operator
# clicks "Add device" in the UI, but useful for manual testing).
sudo headscale --user 1 preauthkeys create --tags tag:phone --expiration 30m

# Mint a hub preauth key (used once per hub box that needs tailnet access).
sudo headscale --user 1 preauthkeys create --tags tag:hub --expiration 1h --reusable=false

# Bump version.
sudo HEADSCALE_VERSION=0.29.0 ./install.sh --server-url=... --acme-email=... --force
```

## ACL: what's allowed, and why

```json
{
  "src": ["tag:hub"],
  "dst": ["tag:phone:5555,30000-65535"]
}
```

- `5555` — covers `adb tcpip 5555` legacy mode (the hub's pair flow tries to
  upgrade to this for a stable serial).
- `30000-65535` — covers Android's dynamic wireless-debugging port. Required
  fallback for Android 12+ phones that refuse the `tcpip` downgrade.
- Direction is one-way; phones can't initiate to the hub.
- System ports (1–29999) on phones remain isolated from the hub.

See `apps/hub/src/provisioning.ts` `tryUpgradeToTcpip` for the pair-time logic
that determines which port a given phone lands on.

## Pinned version

Currently pinned at Headscale **v0.28.0**. The hub's tailnet integration
(`apps/hub/src/tailnet.ts`) uses v0.28's REST shapes — the `aclTags`,
`preAuthKey.id` as union(string|number), and the `nodes` listing fields. Test
before bumping past a major.
