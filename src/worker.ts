import { env as workerEnv } from "cloudflare:workers";
import type { worker } from "../alchemy.run";

// Re-export the Durable Object class so Cloudflare can find it
export { DevboxContainer } from "./container";

const env = workerEnv as typeof worker.Env;

const CONTAINER_NAME = "devbox";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

function html(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

async function getContainerStub() {
  const id = env.DEVBOX_CONTAINER.idFromName(CONTAINER_NAME);
  return env.DEVBOX_CONTAINER.get(id) as any;
}

function page(opts: {
  workerUrl: string;
  warpIp: string;
  sshUsername: string;
  sshHostAlias: string;
  usePublicKey: boolean;
}): string {
  const { workerUrl, warpIp, sshUsername, sshHostAlias, usePublicKey } = opts;

  const vscodeDeepLink = `vscode://vscode-remote/ssh-remote+${encodeURIComponent(
    sshHostAlias
  )}/home/${encodeURIComponent(sshUsername)}`;

  // Cursor supports "Remote - SSH" just like VS Code. Some installs register a
  // separate protocol handler; if yours doesn't, the VS Code link still works
  // if VS Code is installed.
  const cursorDeepLink = `cursor://vscode-remote/ssh-remote+${encodeURIComponent(
    sshHostAlias
  )}/home/${encodeURIComponent(sshUsername)}`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Alchemy + Cloudflare Containers SSH Devbox</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #0b1020; color: #e6e8ee; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 42px; }
      .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10); border-radius: 14px; padding: 18px; margin: 14px 0; }
      code, pre { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.10); border-radius: 10px; }
      code { padding: 2px 6px; }
      pre { padding: 12px; overflow: auto; }
      a { color: #9bd3ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
      button { background: #2b6cff; color: white; border: 0; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .row { display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
      .muted { color: rgba(230,232,238,0.75); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h2>Alchemy + Cloudflare Containers: SSH Devbox</h2>
      <div class="card">
        <div class="row">
          <button id="startBtn">Start / Wake container</button>
          <span class="muted" id="statusText">Status: unknown</span>
        </div>
        <p class="muted">
          Worker: <code>${workerUrl}</code>
        </p>
      </div>

      <div class="card">
        <h3>SSH target</h3>
        <p>
          IP (WARP route): <code>${warpIp}</code><br/>
          Username: <code>${sshUsername}</code><br/>
          Auth: <em>${usePublicKey ? "Public key (configured at deploy time)" : "Password (empty - just press Enter)"}</em>
        </p>
${usePublicKey ? `        <pre><code># ~/.ssh/config
Host ${sshHostAlias}
  HostName ${warpIp}
  User ${sshUsername}
  ServerAliveInterval 30
  ServerAliveCountMax 3
</code></pre>
        <pre><code># connect
ssh ${sshHostAlias}
</code></pre>` : `        <pre><code># ~/.ssh/config
Host ${sshHostAlias}
  HostName ${warpIp}
  User ${sshUsername}
  StrictHostKeyChecking no
  PreferredAuthentications password
  PubkeyAuthentication no
  UserKnownHostsFile /dev/null
  ServerAliveInterval 30
  ServerAliveCountMax 3
</code></pre>
        <pre><code># connect (password is empty, just press Enter)
ssh ${sshHostAlias}
</code></pre>`}
      </div>

      <div class="card">
        <h3>Open in VS Code / Cursor over SSH</h3>
        <p class="muted">These are optional conveniences on top of Remote-SSH.</p>
        <p>
          VS Code deep link: <a href="${vscodeDeepLink}"><code>${vscodeDeepLink}</code></a><br/>
          Cursor deep link: <a href="${cursorDeepLink}"><code>${cursorDeepLink}</code></a>
        </p>
        <p class="muted">
          If the deep link doesn’t work on your machine, use the editor UI:
          Command Palette → <code>Remote-SSH: Connect to Host...</code> → <code>${sshHostAlias}</code>.
        </p>
      </div>
    </div>

    <script>
      const startBtn = document.getElementById('startBtn');
      const statusText = document.getElementById('statusText');

      async function refresh() {
        try {
          const res = await fetch('/api/status');
          const data = await res.json();
          statusText.textContent = 'Status: ' + data.status;
        } catch (e) {
          statusText.textContent = 'Status: error';
        }
      }

      startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        statusText.textContent = 'Status: starting...';
        try {
          const res = await fetch('/api/start', { method: 'POST' });
          const data = await res.json();
          statusText.textContent = 'Status: ' + data.status;
        } catch (e) {
          statusText.textContent = 'Status: error';
        } finally {
          startBtn.disabled = false;
        }
      });

      refresh();
      setInterval(refresh, 5000);
    </script>
  </body>
</html>`;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const container = await getContainerStub();

    if (url.pathname === "/api/start") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
      const result = await container.ensureStarted();
      return json(result);
    }

    if (url.pathname === "/api/stop") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
      await container.stop();
      return json({ status: "stopped" });
    }

    if (url.pathname === "/api/restart") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
      await container.stop();
      // Small delay to ensure clean shutdown
      await new Promise(r => setTimeout(r, 2000));
      const result = await container.ensureStarted();
      return json(result);
    }

    if (url.pathname === "/api/status") {
      const status = await container.getStatus();
      return json({ status });
    }

    if (url.pathname === "/api/ssh") {
      const info = await container.getSshInfo();
      return json(info);
    }

    // Proxy to the container's internal HTTP server for health checks
    if (url.pathname === "/api/container-health") {
      try {
        const resp = await container.fetch(new Request("http://internal/health"));
        const text = await resp.text();
        return json({ healthy: true, response: text.trim() });
      } catch (e: any) {
        return json({ healthy: false, error: e.message }, { status: 500 });
      }
    }

    // Debug endpoint to check bindings (worker level)
    if (url.pathname === "/api/debug") {
      return json({
        worker: {
          hasTunnelToken: !!env.CLOUDFLARE_TUNNEL_TOKEN && env.CLOUDFLARE_TUNNEL_TOKEN !== "",
          tunnelTokenLength: env.CLOUDFLARE_TUNNEL_TOKEN?.length ?? 0,
          warpDestinationIp: env.WARP_DESTINATION_IP,
          sshUsername: env.SSH_USERNAME,
          hasSshPublicKey: !!env.SSH_PUBLIC_KEY && env.SSH_PUBLIC_KEY !== "",
        },
        container: await container.getContainerEnv(),
      });
    }

    const ssh = await container.getSshInfo();
    const workerUrl = url.origin;
    const usePublicKey = !!env.SSH_PUBLIC_KEY && env.SSH_PUBLIC_KEY !== "";

    return html(
      page({
        workerUrl,
        warpIp: ssh.ip,
        sshUsername: ssh.username,
        sshHostAlias: "cf-devbox",
        usePublicKey,
      })
    );
  },
};



