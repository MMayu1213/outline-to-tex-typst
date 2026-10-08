import { Worker } from "node:worker_threads";

// Fixed application code; neither the pattern nor note text is interpolated into it.
const MATCH_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const pattern = new RegExp(workerData.pattern);
parentPort.postMessage(workerData.targets.filter(target => pattern.test(target)));
`;

export async function matchCitationPattern(pattern: string, targets: string[]): Promise<Set<string>> {
  if (!targets.length) return new Set();
  if (pattern.length > 4096 || targets.length > 50_000 || targets.some(target => target.length > 4096)) {
    throw new Error("Citation pattern or link targets are too large. Shorten the pattern or note.");
  }
  const worker = new Worker(MATCH_WORKER, {
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
