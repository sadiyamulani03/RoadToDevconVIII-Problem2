#!/usr/bin/env node
/**
 * Copies the compiled PixelTurf ABI from the Foundry artifact into
 * frontend/lib/pixelTurfAbi.json so the frontend always matches the contract.
 *
 * Usage:  cd frontend && npm run sync-abi
 * (requires `forge build` to have been run first)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(here, "..", "..", "out", "PixelTurf.sol", "PixelTurf.json");
const outPath = join(here, "..", "lib", "pixelTurfAbi.json");

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
if (!Array.isArray(artifact.abi)) {
  console.error("Artifact missing abi");
  process.exit(1);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2) + "\n");
console.log(`Synced ABI (${artifact.abi.length} entries) -> lib/pixelTurfAbi.json`);
