import { Container, type ContainerOptions } from "@cloudflare/containers";
import type { DurableObject } from "cloudflare:workers";
import type { worker } from "../alchemy.run";

type Env = typeof worker.Env;

export class DevboxContainer extends Container {
  // Keep it alive long enough to be useful for editor sessions.
  sleepAfter = "60m";
  enableInternet = true;

  // Environment variables passed into the *container runtime*.
  envVars = {
    CLOUDFLARE_TUNNEL_TOKEN: (this.env as Env).CLOUDFLARE_TUNNEL_TOKEN ?? "null",
    WARP_DESTINATION_IP: (this.env as Env).WARP_DESTINATION_IP ?? "100.101.102.103",
    SSH_PUBLIC_KEY: (this.env as Env).SSH_PUBLIC_KEY ?? "",
    SSH_USERNAME: (this.env as Env).SSH_USERNAME ?? "dev",
  };

  private _container: DurableObject["ctx"]["container"];

  constructor(ctx: DurableObject["ctx"], env: Env, options?: ContainerOptions) {
    super(ctx, env);
    if (ctx.container === undefined) {
      throw new Error(
        "Containers have not been enabled for this Durable Object class. Ensure Wrangler/Alchemy is configured for Containers."
      );
    }
    this._container = ctx.container;
  }

  // RPC used by the Worker UI
  public async ensureStarted(): Promise<{ status: string }> {
    await this.start();
    return { status: await this.getStatus() };
  }

  // RPC used by the Worker UI
  public async getSshInfo(): Promise<{ ip: string; username: string }> {
    return {
      ip: this.envVars.WARP_DESTINATION_IP,
      username: this.envVars.SSH_USERNAME,
    };
  }

  // Minimal container HTTP endpoint (useful for quick sanity checks)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("not found\n", { status: 404 });
  }
}


