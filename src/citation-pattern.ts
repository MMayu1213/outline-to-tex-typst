import { Worker as NodeWorker } from "node:worker_threads";

// Fixed application code; neither the pattern nor note text is interpolated into it.
const NODE_MATCH_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const pattern = new RegExp(workerData.pattern);
parentPort.postMessage(workerData.targets.filter(target => pattern.test(target)));
`;

const BROWSER_MATCH_WORKER = `
self.onmessage = ({ data }) => {
  try {
    const pattern = new RegExp(data.pattern);
    self.postMessage({ matches: data.targets.filter(target => pattern.test(target)) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
`;

async function matchInBrowser(pattern: string, targets: string[]): Promise<Set<string>> {
  const url = URL.createObjectURL(new Blob([BROWSER_MATCH_WORKER], { type: "text/javascript" }));
  let worker: Worker | undefined;
  try {
    worker = new globalThis.Worker(url);
    const activeWorker = worker;
    return await new Promise<Set<string>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Citation pattern took too long. Simplify the citation pattern in settings.")), 1000);
      activeWorker.onmessage = event => {
        clearTimeout(timer);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(new Set(event.data.matches));
      };
      activeWorker.onerror = event => {
        clearTimeout(timer);
        reject(new Error(`Citation matcher failed: ${event.message}`));
      };
      activeWorker.postMessage({ pattern, targets });
    });
  } finally {
    worker?.terminate();
    URL.revokeObjectURL(url);
  }
}

export async function matchCitationPattern(pattern: string, targets: string[]): Promise<Set<string>> {
  if (!targets.length) return new Set();
  if (pattern.length > 4096 || targets.length > 50_000 || targets.some(target => target.length > 4096)) {
    throw new Error("Citation pattern or link targets are too large. Shorten the pattern or note.");
  }
  // Obsidian's Electron renderer cannot create Node worker_threads. Use Chromium
  // Web Workers there; the Node implementation is for CLI tests only.
  if (typeof window !== "undefined") {
    if (typeof globalThis.Worker !== "function") throw new Error("Web Workers are unavailable. Citation matching cannot run safely.");
    return matchInBrowser(pattern, targets);
  }
  const worker = new NodeWorker(NODE_MATCH_WORKER, {
    eval: true, workerData: { pattern, targets },
    resourceLimits: { maxOldGenerationSizeMb: 32, stackSizeMb: 2 },
  });
  try {
    return await new Promise<Set<string>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Citation pattern took too long. Simplify the citation pattern in settings.")), 1000);
      const finish = (error?: Error, matches?: string[]): void => {
        clearTimeout(timer);
        if (error) reject(error); else resolve(new Set(matches));
      };
      worker.once("message", (matches: string[]) => finish(undefined, matches));
      worker.once("error", error => finish(error));
      worker.once("exit", code => finish(new Error(`Citation matcher stopped (exit ${code}).`)));
    });
  } finally {
    await worker.terminate();
  }
}
