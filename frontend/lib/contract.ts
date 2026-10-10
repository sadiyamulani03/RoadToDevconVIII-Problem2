import pixelTurfAbiJson from "./pixelTurfAbi.json";
import type { Abi, Address } from "viem";

/**
 * ABI for PixelTurf, synced from the Foundry artifact with `npm run sync-abi`.
 * Keep this file generated — do not hand-edit pixelTurfAbi.json.
 */
export const PIXEL_TURF_ABI = pixelTurfAbiJson as unknown as Abi;

/** Contract address, configured after deployment. Empty until set. */
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "") as Address;

/** Block at which the contract was deployed — start of event history. */
export const DEPLOYMENT_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK || "0");

export const IS_CONTRACT_CONFIGURED =
  CONTRACT_ADDRESS.length === 42 && CONTRACT_ADDRESS.startsWith("0x");

/** Fallback display constants — the live values are read from the contract. */
export const FALLBACK_WIDTH = 100;
export const FALLBACK_HEIGHT = 100;
export const FALLBACK_COOLDOWN = 60;
