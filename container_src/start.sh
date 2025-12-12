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

# ============================================================================
# SSH Authentication Setup
# ============================================================================
# If SSH_PUBLIC_KEY is provided, use public key auth.
# Otherwise, use empty password auth (WARP routing provides the security layer).

if [ -n "$SSH_PUBLIC_KEY" ]; then
  echo "[devbox] SSH_PUBLIC_KEY provided - configuring public key authentication"
  
  # Set up authorized_keys
  mkdir -p "$HOME_DIR/.ssh"
  chmod 700 "$HOME_DIR/.ssh"
  printf "%s\n" "$SSH_PUBLIC_KEY" > "$HOME_DIR/.ssh/authorized_keys"
  chmod 600 "$HOME_DIR/.ssh/authorized_keys"
  chown -R "$SSH_USERNAME:$SSH_USERNAME" "$HOME_DIR/.ssh"
  
  # Configure sshd for pubkey auth
  cat >> /etc/ssh/sshd_config.d/devbox.conf <<EOF
# Public key authentication (SSH_PUBLIC_KEY was provided)
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication no
EOF
else
  echo "[devbox] No SSH_PUBLIC_KEY - configuring empty password authentication"
  
  # Set empty password for the user
  passwd -d "$SSH_USERNAME" || echo "[devbox] WARNING: Failed to set empty password"
  
  # Configure sshd for password auth with empty password
  cat >> /etc/ssh/sshd_config.d/devbox.conf <<EOF
# Password authentication with empty password (no SSH_PUBLIC_KEY provided)
# WARP routing provides the security layer
PasswordAuthentication yes
PermitEmptyPasswords yes
PubkeyAuthentication no
EOF
fi

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
