# Alchemy + Cloudflare Containers: SSH Devbox Example

This repo is a **minimal example** of using **Alchemy** to deploy:

- a **public Cloudflare Worker** that serves a tiny UI, and
- a **Cloudflare Container** reachable over **SSH** via **Cloudflare Tunnel + WARP routing**,

so that tools like **VS Code Remote-SSH** and **Cursor Remote-SSH** can open against the running container.

There is **nothing Minecraft-related** here.

## What you get

- **Worker UI** (public): shows the SSH target and offers a "Start / Wake container" button
- **SSH into the container** at a fixed **100.x.x.x** address (default: `100.120.1.1`)
- **Editor support**:
  - VS Code: Remote - SSH
  - Cursor: Remote - SSH (same workflow)

## How it works (high level)

1. `alchemy.run.ts` creates a **Cloudflare Tunnel** with **WARP routing enabled**
2. `alchemy.run.ts` creates a **TunnelRoute** for a **/32** in `100.0.0.0/8`:
   - default: `100.120.1.1/32`
3. The container runs:
   - `sshd` listening on `127.0.0.1` **and** the `WARP_DESTINATION_IP`
   - `cloudflared tunnel run --protocol http2 ...` to attach itself to the Tunnel
   - Enables ICMP proxy via `sysctl` for cloudflared
   - Adds the WARP IP to the loopback interface
4. Any device enrolled in your Zero Trust org via **Cloudflare WARP** can reach `100.120.1.1:22`

## Files to look at

- `alchemy.run.ts`: infrastructure definition (Tunnel + Container + Worker)
- `src/worker.ts`: the public UI + `/api/start`
- `src/container.ts`: the Container DO class that injects runtime env vars
- `container_src/Dockerfile`: minimal image (`openssh-server` + `cloudflared`)
- `container_src/start.sh`: starts `sshd` + `cloudflared`, adds the WARP /32 to `lo`

## Prereqs

- **Bun** installed locally (to run `bun install` / `bun run dev`)
- A **Cloudflare account** with **Zero Trust** enabled
- **Cloudflare WARP client** installed on your laptop, enrolled in your org
- **Alchemy CLI** (installed via `bun install`, provided by this repo’s `package.json` from npm)

## Configure env vars

This example reads env vars from `.env` when you run `bun run dev` / `bun run deploy`.

1. Create a `.env` file (or copy from `example.env` if it exists):

```bash
touch .env
```

2. **Authentication** – choose one:

   **Option A: Empty password (default, simplest)**
   - Don't set `SSH_PUBLIC_KEY` – leave it empty or omit it
   - SSH will prompt for a password; just press Enter (empty)
   - WARP routing provides the security layer (only enrolled devices can reach the IP)

   **Option B: Public key auth**
   - Set `SSH_PUBLIC_KEY` in `.env` to your public key:
     ```
     SSH_PUBLIC_KEY="ssh-ed25519 AAAA... you@laptop"
     ```
   - The container will install this key and require it for SSH

3. Optional: change the IP
   - Default is `100.120.1.1` (chosen to avoid conflicts with existing WARP routes).
   - If you change it, set `WARP_DESTINATION_IP` in `.env`.

## Run (dev)

```bash
bun install
bun run dev
```

Alchemy will print a **Worker URL** and the **WARP SSH IP**.

Open the Worker URL in your browser and click **Start / Wake container**.

## SSH config

Add this to your `~/.ssh/config`. The Worker UI will show the exact config to use.

**If using empty password auth (default):**

```ssh-config
Host cf-devbox
  HostName 100.120.1.1
  User dev
  StrictHostKeyChecking no
  PreferredAuthentications password
  PubkeyAuthentication no
  UserKnownHostsFile /dev/null
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

**If using public key auth (SSH_PUBLIC_KEY was set):**

```ssh-config
Host cf-devbox
  HostName 100.120.1.1
  User dev
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

Then connect:

```bash
ssh cf-devbox
# If using empty password, just press Enter when prompted
```

## Open in VS Code / Cursor over SSH

### VS Code

- Install the extension: **Remote - SSH**
- Use: Command Palette → **Remote-SSH: Connect to Host...** → `cf-devbox`

Deep link (optional):

- `vscode://vscode-remote/ssh-remote+cf-devbox/home/dev`

### Cursor

Cursor supports the same **Remote - SSH** workflow:

- Command Palette → **Remote-SSH: Connect to Host...** → `cf-devbox`

Deep link (optional):

- `cursor://vscode-remote/ssh-remote+cf-devbox/home/dev`

## Notes / troubleshooting

- **If SSH hangs or "Network is unreachable"**:
  - confirm Cloudflare WARP is connected and your device is enrolled in the same org as the Tunnel
  - confirm you clicked **Start / Wake container** and status shows "running"
  - wait a few seconds for cloudflared to connect inside the container
- **If "Permission denied"**:
  - if using public key auth, confirm `SSH_PUBLIC_KEY` in `.env` matches your local key
  - if using empty password, make sure your SSH config has `PreferredAuthentications password`
- **Changing users**:
  - set `SSH_USERNAME` in `.env` (default is `dev`)
- **Security**:
  - this example Worker is public and intentionally minimal
  - WARP routing provides the security layer (only enrolled devices can reach the private IP)
  - empty password mode is safe because the IP is only routable via WARP

## Making this a standalone git repo

This folder is meant to be its own repo:

```bash
cd examples/alchemy-ssh-devbox
git init
git add .
git commit -m "Initial Alchemy SSH devbox example"
```


