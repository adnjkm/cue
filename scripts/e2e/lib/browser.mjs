import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

/**
 * Playwright's own browser when it is installed; otherwise the newest headless shell already in the cache,
 * so a version bump never forces a browser download.
 */
export function executablePath() {
  try {
    const own = chromium.executablePath();
    if (fs.existsSync(own)) return undefined;
  } catch {
    // Not installed for this Playwright version.
  }
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), os.platform() === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  if (!fs.existsSync(cache)) return undefined;
  for (const dir of fs.readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()) {
    const sub = fs.readdirSync(path.join(cache, dir)).find((s) => s.startsWith("chrome-headless-shell"));
    const bin = sub && path.join(cache, dir, sub, os.platform() === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");
    if (bin && fs.existsSync(bin)) return bin;
  }
  return undefined;
}

export function launch() {
  return chromium.launch({
    executablePath: executablePath(),
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
}
