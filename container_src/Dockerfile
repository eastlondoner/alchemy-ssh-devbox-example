# syntax=docker/dockerfile:1

FROM debian:bookworm-slim

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

# Default: only localhost. The entrypoint appends WARP_DESTINATION_IP at runtime.
RUN printf '%s\n' \
  '# Listen on localhost only by default (cloudflared and/or WARP IP will be added at runtime)' \
  'ListenAddress 127.0.0.1' \
  'ListenAddress ::1' \
  '' \
  '# Security defaults for an example devbox' \
  'PermitRootLogin no' \
  'PasswordAuthentication no' \
  'KbdInteractiveAuthentication no' \
  'ChallengeResponseAuthentication no' \
  'UsePAM yes' \
  'AllowUsers dev' \
  '' \
  '# Allow key auth' \
  'PubkeyAuthentication yes' \
  'AuthorizedKeysFile .ssh/authorized_keys' \
  '' \
  '# Keep the connection stable for editor sessions' \
  'ClientAliveInterval 30' \
  'ClientAliveCountMax 3' \
  > /etc/ssh/sshd_config.d/devbox.conf

COPY --chmod=755 start.sh /usr/local/bin/start.sh

EXPOSE 22
CMD ["/usr/local/bin/start.sh"]


