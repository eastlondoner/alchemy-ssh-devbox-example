#!/usr/bin/env bash
set -euo pipefail

echo "[devbox] booting..."

SSH_USERNAME="${SSH_USERNAME:-dev}"
SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY:-}"
WARP_IP="${WARP_DESTINATION_IP:-100.120.1.1}"
TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"

mkdir -p /var/run/sshd
ssh-keygen -A >/dev/null 2>&1 || true

# If the username isn't "dev", try to create it (optional override).
if ! id -u "$SSH_USERNAME" >/dev/null 2>&1; then
  echo "[devbox] creating user: $SSH_USERNAME"
  useradd -m -s /bin/bash "$SSH_USERNAME"
fi

HOME_DIR="$(getent passwd "$SSH_USERNAME" | cut -d: -f6)"
mkdir -p "$HOME_DIR/.ssh"
chmod 700 "$HOME_DIR/.ssh"

if [ -n "$SSH_PUBLIC_KEY" ]; then
  echo "[devbox] installing SSH public key for $SSH_USERNAME"
  printf "%s\n" "$SSH_PUBLIC_KEY" > "$HOME_DIR/.ssh/authorized_keys"
  chmod 600 "$HOME_DIR/.ssh/authorized_keys"
else
  echo "[devbox] WARNING: SSH_PUBLIC_KEY is empty; SSH will not be usable until you set it."
fi

chown -R "$SSH_USERNAME:$SSH_USERNAME" "$HOME_DIR/.ssh"

# ============================================================================
# WARP / Cloudflare Tunnel Setup
# ============================================================================
# WARP routing expects the container to "own" the /32 IP on loopback and for
# sshd to listen on that IP. cloudflared runs the tunnel that connects this
# container to the Cloudflare network.

if [ -n "$WARP_IP" ] && [ "$WARP_IP" != "null" ]; then
  echo "[devbox] configuring WARP IP: $WARP_IP"

  # Add the WARP destination IP to the loopback interface so the kernel accepts
  # packets destined for it.
  ip addr add "${WARP_IP}/32" dev lo 2>/dev/null || echo "[devbox] IP $WARP_IP already on lo (or failed)"

  # Tell sshd to also listen on this IP (in addition to localhost from Dockerfile config)
  echo "ListenAddress $WARP_IP" >> /etc/ssh/sshd_config.d/devbox.conf
fi

# Enable ICMP proxy for cloudflared by allowing the container's group to send ICMP.
# This fixes: "ICMP Proxy disabled - Group ID ... is not in the allowed ping group range"
echo "[devbox] enabling ICMP for cloudflared (ping_group_range)..."
sysctl -w net.ipv4.ping_group_range="0 2147483647" || echo "[devbox] WARNING: Failed to set ping_group_range (ICMP proxy may be disabled)"

echo "[devbox] starting sshd..."
/usr/sbin/sshd -D -e &
SSHD_PID=$!

if [ -n "$TUNNEL_TOKEN" ] && [ "$TUNNEL_TOKEN" != "null" ]; then
  echo "[devbox] starting cloudflared tunnel..."
  # Must use --protocol http2 inside Cloudflare Containers (QUIC doesn't work).
  cloudflared tunnel run --protocol http2 --token "$TUNNEL_TOKEN" &
  CLOUDFLARED_PID=$!
else
  echo "[devbox] WARNING: CLOUDFLARE_TUNNEL_TOKEN is empty; WARP routing will not work."
  CLOUDFLARED_PID=""
fi

echo "[devbox] ready (sshd pid=$SSHD_PID, cloudflared pid=${CLOUDFLARED_PID:-none})"

# Keep the container alive as long as either primary process is alive.
wait -n
