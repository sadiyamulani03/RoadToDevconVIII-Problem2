/**
 * Integration check for the board-reconstruction + live-polling logic.
 *
 * Runs against a local Anvil node with PixelTurf deployed. This is the same
 * code path the frontend uses (lib/events.ts) — proving that:
 *  1. the board is rebuilt from PixelPlaced events (no per-tile reads),
 *  2. re-painted tiles resolve to their latest event,
 *  3. pollNewPlacements applies new events incrementally.
 *
 * Usage:
 *   anvil (in another shell)
 *   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
 *     --private-key <anvil-key-0>
 *   PIXEL_TURF_ADDRESS=0x... PIXEL_TURF_DEPLOY_BLOCK=<n> npm run verify-events
 */
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
} from "viem";
import { anvil } from "viem/chains";
import pixelTurfAbiJson from "../lib/pixelTurfAbi.json";

process.env.NEXT_PUBLIC_DEV_RPC_URL = process.env.NEXT_PUBLIC_DEV_RPC_URL || "http://127.0.0.1:8545";
process.env.NEXT_PUBLIC_CONTRACT_ADDRESS =
  process.env.PIXEL_TURF_ADDRESS || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK =
  process.env.PIXEL_TURF_DEPLOY_BLOCK || process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK || "0";

// lib/contract.ts is imported dynamically inside main() — after the env
// setup above — so it sees the configuration. (Also keeps this file valid
// CommonJS for tsx, which does not support top-level await.)

const ABI = pixelTurfAbiJson as unknown as Abi;
const RPC = http("http://127.0.0.1:8545");

// Anvil's first two default account addresses — public well-known constants of
// `anvil`, used here only as senders via eth_sendTransaction against the local
// node's unlocked accounts. No private keys exist anywhere in this repository.
const ANVIL_ACCOUNT_0: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ANVIL_ACCOUNT_1: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

async function main(): Promise<void> {
  const contract = await import("../lib/contract");
  const { loadInitialBoard, pollNewPlacements, createBoard } = await import("../lib/events");

  if (!contract.IS_CONTRACT_CONFIGURED || !contract.CONTRACT_ADDRESS) {
    console.error("Set PIXEL_TURF_ADDRESS (and optionally PIXEL_TURF_DEPLOY_BLOCK).");
    process.exit(1);
  }
  const address = contract.CONTRACT_ADDRESS as Address;
  console.log(`Contract: ${address}, deployment block: ${contract.DEPLOYMENT_BLOCK}`);

  const publicClient = createPublicClient({ chain: anvil, transport: RPC });
  const testClient = createTestClient({ chain: anvil, transport: RPC, mode: "anvil" });
  const jsonRpcAccount = (addr: Address) => ({ address: addr, type: "json-rpc" }) as const;
  const walletA = createWalletClient({
    account: jsonRpcAccount(ANVIL_ACCOUNT_0),
    chain: anvil,
    transport: RPC,
  });
  const walletB = createWalletClient({
    account: jsonRpcAccount(ANVIL_ACCOUNT_1),
    chain: anvil,
    transport: RPC,
  });

  // A paints three tiles (advance time past the cooldown between them).
  for (const [x, y, color] of [
    [3, 4, 0xff0000],
    [3, 4, 0x00ff00], // repaint — latest event must win
    [40, 60, 0x0000ff],
  ] as const) {
    const hash = await walletA.writeContract({
      address,
      abi: ABI,
      functionName: "placePixel",
      args: [x, y, color],
      chain: anvil,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    await testClient.increaseTime({ seconds: 61 });
    await testClient.mine({ blocks: 1 });
  }

  // B paints one tile right away.
  const hashB = await walletB.writeContract({
    address,
    abi: ABI,
    functionName: "placePixel",
    args: [99, 99, 0xabcdef],
    chain: anvil,
  });
  await publicClient.waitForTransactionReceipt({ hash: hashB });

  // 1. Rebuild the board purely from events.
  // cacheTime: 0 — a cached head from waitForTransactionReceipt's internal
  // polling could hide the most recent block right after mining.
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  const board = await loadInitialBoard(publicClient, latest);
  assert(board.tiles.size === 3, `board rebuilt from events with 3 tiles (got ${board.tiles.size})`);
  assert(
    board.tiles.get(4 * 100 + 3)?.color === 0x00ff00,
    "repainted tile resolves to latest event (0x00ff00)"
  );
  assert(board.tiles.get(60 * 100 + 40)?.color === 0x0000ff, "second tile correct (0x0000ff)");
  assert(board.tiles.get(99 * 100 + 99)?.color === 0xabcdef, "player B tile correct (0xabcdef)");
  assert(board.lastProcessedBlock === latest, "lastProcessedBlock matches chain head");

  // 2. Live poll picks up a new placement without a reload.
  await testClient.increaseTime({ seconds: 61 });
  await testClient.mine({ blocks: 1 });
  const hashC = await walletB.writeContract({
    address,
    abi: ABI,
    functionName: "placePixel",
    args: [0, 0, 0x123456],
    chain: anvil,
  });
  await publicClient.waitForTransactionReceipt({ hash: hashC });

  const applied = await pollNewPlacements(publicClient, board);
  assert(applied === 1, `poll applied exactly 1 new event (got ${applied})`);
  assert(board.tiles.get(0)?.color === 0x123456, "live update landed on the board");

  const appliedAgain = await pollNewPlacements(publicClient, board);
  assert(appliedAgain === 0, "re-polling with no new events applies nothing");

  // 3. Empty board path: a fresh client-style board from a far-future block.
  const empty = createBoard(contract.DEPLOYMENT_BLOCK);
  assert(empty.tiles.size === 0, "fresh board is empty");

  console.log("\nAll event-reconstruction checks passed.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
