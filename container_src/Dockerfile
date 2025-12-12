# syntax=docker/dockerfile:1
#
# Minimal SSH devbox for Cloudflare Containers with WARP routing
#
# This container runs sshd + cloudflared to allow SSH access via Cloudflare WARP.
# The entrypoint script:
#   1. Adds WARP_DESTINATION_IP to the loopback interface (ip addr add)
#   2. Configures sshd to listen on that IP
#   3. Enables ICMP proxy for cloudflared (sysctl ping_group_range)
#   4. Runs cloudflared tunnel with --protocol http2
#
# Required env vars at runtime:
#   CLOUDFLARE_TUNNEL_TOKEN - tunnel token from Alchemy
#   WARP_DESTINATION_IP     - the private 100.x.x.x IP for WARP routing
#
# Optional env vars:
#   SSH_PUBLIC_KEY - if set, enables public key auth with this key
#                    if not set, uses empty password auth (WARP provides security)
#   SSH_USERNAME   - defaults to "dev"

FROM debian:bookworm-slim

# Install sshd, cloudflared, and network tools needed for WARP setup
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    iproute2 \
    openssh-server \
    procps \
  && mkdir -p /var/run/sshd /etc/ssh/sshd_config.d \
  && useradd -m -s /bin/bash dev \
  && mkdir -p /home/dev/.ssh \
  && chown -R dev:dev /home/dev/.ssh \
  && chmod 700 /home/dev/.ssh \
  && curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg \
    -o /usr/share/keyrings/cloudflare-public-v2.gpg \
  && echo 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    > /etc/apt/sources.list.d/cloudflared.list \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends cloudflared \
  && rm -rf /var/lib/apt/lists/*

# Default sshd config: only localhost until entrypoint adds WARP IP
# Auth mode (password vs pubkey) is configured at runtime by start.sh
RUN printf '%s\n' \
  '# Listen on localhost only by default' \
  '# The entrypoint script appends WARP_DESTINATION_IP at runtime' \
  'ListenAddress 127.0.0.1' \
  'ListenAddress ::1' \
  '' \
  '# Security: no root login' \
  'PermitRootLogin no' \
  'AllowUsers dev' \
  'UsePAM yes' \
  '' \
  '# Keep connections stable for editor sessions' \
  'ClientAliveInterval 30' \
  'ClientAliveCountMax 3' \
  '' \
  '# Auth mode is configured at runtime by start.sh based on SSH_PUBLIC_KEY' \
  > /etc/ssh/sshd_config.d/devbox.conf

COPY --chmod=755 start.sh /usr/local/bin/start.sh

EXPOSE 22
CMD ["/usr/local/bin/start.sh"]
