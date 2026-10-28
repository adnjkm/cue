import { spawn } from "node:child_process";
import net from "node:net";

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** `next start` on a free port in mock mode. Refuses to hand back a server that is not in mock mode. */
export async function startServer(root) {
  const port = await freePort();
  const child = spawn("node_modules/.bin/next", ["start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, CUE_AI: "mock", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited:\n${log}`);
    try {
      const res = await fetch(`${base}/api/status`);
      if (res.ok) {
        const status = await res.json();
        if (status.mode !== "mock") {
          child.kill();
          throw new Error(`Refusing to run: /api/status says mode "${status.mode}", not "mock".`);
        }
        break;
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Refusing")) throw e;
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Server did not answer /api/status within 60 s:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { base, stop: () => child.kill(), log: () => log };
}
