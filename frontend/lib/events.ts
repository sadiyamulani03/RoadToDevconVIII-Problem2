import {
  type Address,
  type PublicClient,
  parseAbiItem,
  type Log,
} from "viem";
import { CONTRACT_ADDRESS, DEPLOYMENT_BLOCK, IS_CONTRACT_CONFIGURED } from "./contract";

/** Single PixelPlaced event decoded. */
export const pixelPlacedEvent = parseAbiItem(
  "event PixelPlaced(uint32 indexed x, uint32 indexed y, address indexed player, uint32 color, uint256 timestamp)"
);

export interface TileUpdate {
  x: number;
  y: number;
  color: number;
  player: Address;
  blockNumber: bigint;
  logIndex: number;
}

export interface BoardState {
  /** packed index (y * 100 + x) -> latest update */
  tiles: Map<number, TileUpdate>;
  /** every fully processed block is <= this value */
  lastProcessedBlock: bigint;
}

export function createBoard(fromBlock: bigint): BoardState {
  return { tiles: new Map(), lastProcessedBlock: fromBlock === 0n ? 0n : fromBlock - 1n };
}

/** Blocks per eth_getLogs request — kept modest for public RPC log limits. */
export const LOG_CHUNK_SIZE = 5_000n;

function toUpdate(log: Log): TileUpdate {
  const { args } = log as unknown as Log & {
    args: { x: number; y: number; player: Address; color: number; timestamp: bigint };
  };
  if (
    args === undefined ||
    args.x === undefined ||
    args.y === undefined ||
    args.color === undefined ||
    args.player === undefined
  ) {
    throw new Error("PixelPlaced event missing decoded args");
  }
  return {
    x: Number(args.x),
    y: Number(args.y),
    color: Number(args.color),
    player: args.player,
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
  };
}

/**
 * Fetches placement logs in chronological order, splitting the block range
 * into chunks so no single RPC request exceeds typical log-range limits.
 * Returns updates sorted by (blockNumber, logIndex).
 */
export async function fetchPlacementLogs(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint
): Promise<TileUpdate[]> {
  if (!IS_CONTRACT_CONFIGURED) return [];
  if (fromBlock > toBlock) return [];

  const updates: TileUpdate[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const chunkEnd = cursor + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : cursor + LOG_CHUNK_SIZE - 1n;
    try {
      const logs = await client.getLogs({
        address: CONTRACT_ADDRESS,
        event: pixelPlacedEvent,
        fromBlock: cursor,
        toBlock: chunkEnd,
      });
      for (const log of logs) updates.push(toUpdate(log));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Event query failed for blocks ${cursor}-${chunkEnd}: ${reason}`
      );
    }
    cursor = chunkEnd + 1n;
  }

  updates.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });
  return updates;
}

/** Applies updates (assumed chronological) to the board — last write wins. */
export function applyUpdates(board: BoardState, updates: TileUpdate[]): void {
  for (const u of updates) {
    board.tiles.set(u.y * 100 + u.x, u);
    if (u.blockNumber > board.lastProcessedBlock) {
      board.lastProcessedBlock = u.blockNumber;
    }
  }
}

/**
 * Reconstructs the board from the deployment block through `toBlock`.
 * On RPC failure, keeps progress made so far and throws with the next block
 * that still needs processing (`err.nextFromBlock`).
 */
export async function loadInitialBoard(
  client: PublicClient,
  toBlock: bigint,
  onProgress?: (fraction: number) => void
): Promise<BoardState> {
  const board = createBoard(DEPLOYMENT_BLOCK);
  const from = DEPLOYMENT_BLOCK;
  const total = toBlock > from ? toBlock - from : 0n;

  let cursor = from;
  try {
    while (cursor <= toBlock) {
      const chunkEnd =
        cursor + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : cursor + LOG_CHUNK_SIZE - 1n;
      const updates = await fetchPlacementLogs(client, cursor, chunkEnd);
      applyUpdates(board, updates);
      board.lastProcessedBlock = chunkEnd;
      cursor = chunkEnd + 1n;
      if (onProgress && total > 0n) {
        onProgress(Number((chunkEnd - from) * 1000n / total) / 1000);
      }
    }
  } catch (err) {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    (wrapped as Error & { nextFromBlock?: bigint }).nextFromBlock = cursor;
    throw wrapped;
  }
  return board;
}

/**
 * Polls for placements after `board.lastProcessedBlock`. Mutates the board
 * with any new tiles and returns the number of applied updates.
 * Overlapping calls are the caller's responsibility to prevent.
 */
export async function pollNewPlacements(
  client: PublicClient,
  board: BoardState
): Promise<number> {
  // cacheTime: 0 — never trust a cached head here. A stale head right after
  // a placement would make us skip its event until a later tick.
  const latest = await client.getBlockNumber({ cacheTime: 0 });
  if (latest <= board.lastProcessedBlock) return 0;

  const updates = await fetchPlacementLogs(
    client,
    board.lastProcessedBlock + 1n,
    latest
  );
  applyUpdates(board, updates);
  // Advance even when there were no events so we do not re-scan empty ranges.
  if (latest > board.lastProcessedBlock) board.lastProcessedBlock = latest;
  return updates.length;
}
