import alchemy, { type Scope } from "alchemy";
import { CloudflareStateStore, SQLiteStateStore } from "alchemy/state";
import { Container, Tunnel, TunnelRoute, WarpDefaultProfile, Worker } from "alchemy/cloudflare";
import { DevboxContainer } from "./src/container";

const cloudflareStateStore = (scope: Scope) =>
  new CloudflareStateStore(scope, {
    forceUpdate: process.env.ALCHEMY_CF_STATE_FORCE_UPDATE?.toLowerCase() === "true",
    stateToken: alchemy.secret(
      process.env.ALCHEMY_STATE_TOKEN ??
        "example-state-token-change-me"
    ),
    scriptName: "alchemy-ssh-devbox-example-state-store",
  });

const localStateStore = (scope: Scope) => new SQLiteStateStore(scope);

const appName = process.env.WRANGLER_CI_OVERRIDE_NAME ?? "alchemy-ssh-devbox-example";
const app = await alchemy(appName, {
  stateStore: process.env.NODE_ENV === "development" ? localStateStore : cloudflareStateStore,
  password:
    process.env.ALCHEMY_PASSWORD ??
    "example-password-change-me",
  stage: appName,
});

// Pick a memorable 100.x.x.x IP outside any existing WARP route CIDRs.
// Avoid 100.96.0.0/12 (100.96–100.111) as there's often a broader route there.
export const WARP_DESTINATION_IP = process.env.WARP_DESTINATION_IP ?? "100.120.1.1";

// Create a Tunnel with WARP routing enabled.
// We only need the required catch-all ingress rule; SSH access is via WARP routing
// at the IP layer, not hostname-based ingress.
const tunnel = await Tunnel("devbox-ssh-tunnel", {
  name: `${app.name}-devbox-ssh`,
  adopt: true,
  warpRouting: { enabled: true },
  ingress: [{ service: "http_status:404" }],
});

// Capture the tunnel token - must be resolved before use in bindings
const tunnelToken = tunnel.token.unencrypted;
if (!tunnelToken) {
  throw new Error("Tunnel token is undefined - this shouldn't happen after successful tunnel creation/adoption");
}

await TunnelRoute("devbox-warp-route", {
  network: `${WARP_DESTINATION_IP}/32`,
  tunnel,
  comment: "WARP route for SSH into a Cloudflare Container",
});

// Ensure the account's default WARP profile includes this /32 so enrolled devices can reach it.
await WarpDefaultProfile("devbox-warp-default-profile", {
  allowedToLeave: true,
  splitTunnel: {
    mode: "include",
    entries: [{ address: `${WARP_DESTINATION_IP}/32` }],
  },
});

export const container = Container<DevboxContainer>("devbox-container", {
  name: `${app.name}-container`,
  className: "DevboxContainer",
  adopt: true,
  build: {
    context: "container_src",
    dockerfile: "Dockerfile",
  },
  instanceType: "standard-1",
  maxInstances: 1,
});

// Bindings are shared between the Worker and the Container's Durable Object class.
// This is what lets `DevboxContainer.envVars` pass the token/IP into the container runtime.
export const worker = await Worker("devbox-worker", {
  name: `${app.name}`,
  entrypoint: "src/worker.ts",
  adopt: true,
  compatibility: "node",
  bindings: {
    DEVBOX_CONTAINER: await container,
    CLOUDFLARE_TUNNEL_TOKEN: tunnelToken,
    WARP_DESTINATION_IP,
    SSH_PUBLIC_KEY: process.env.SSH_PUBLIC_KEY ?? "",
    SSH_USERNAME: process.env.SSH_USERNAME ?? "dev",
  },
});

console.log("Worker URL:", worker.url);
console.log("WARP SSH IP:", WARP_DESTINATION_IP);

await app.finalize();


