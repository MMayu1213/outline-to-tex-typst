import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PandocRunner {
  run(args: string[], input: string): Promise<string>;
}

export class LocalPandoc implements PandocRunner {
  constructor(readonly executable: string) {}

  run(args: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile(this.executable, args, {
        encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
      }, (error, stdout, stderr) => {
        if (error) reject(new Error(`Pandoc failed: ${stderr.trim() || error.message}`));
        else if (stderr.trim()) reject(new Error(`Pandoc reported a warning. Output was not saved:\n${stderr.trim()}`));
        else resolve(stdout);
      });
      child.stdin?.on("error", () => { /* Process completion reports the underlying failure. */ });
      child.stdin?.end(input);
    });
  }
}

export async function findPandoc(configured: string): Promise<LocalPandoc> {
  const candidates = configured.trim() ? [configured.trim()] : [
    "pandoc", "/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc",
    join(homedir(), ".local", "bin", "pandoc"),
    ...(process.platform === "win32" ? [
      join(process.env.LOCALAPPDATA ?? homedir(), "Pandoc", "pandoc.exe"),
      join(process.env.ProgramFiles ?? "C:\\Program Files", "Pandoc", "pandoc.exe"),
    ] : []),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate !== "pandoc") await access(candidate, constants.X_OK);
      const runner = new LocalPandoc(candidate);
      const version = await runner.run(["--version"], "");
      const match = version.match(/^pandoc (\d+)\.(\d+)/);
      if (!match || Number(match[1]) < 3 || (Number(match[1]) === 3 && Number(match[2]) < 4)) {
        if (configured.trim()) throw new Error("Pandoc 3.4 or newer is required.");
        continue;
      }
      return runner;
    } catch (error) {
      if (configured.trim()) throw new Error(`Cannot use configured Pandoc: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error("Pandoc 3.4 or newer was not found. Install Pandoc and set its executable path in the plugin settings.");
}
