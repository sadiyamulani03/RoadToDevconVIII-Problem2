"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { WalletBar } from "@/components/WalletBar";
import { CooldownDisplay } from "@/components/CooldownDisplay";
import { PixelCanvas, type SelectedTile } from "@/components/PixelCanvas";
import { ColorPalette } from "@/components/ColorPalette";
import { StatusBanner } from "@/components/StatusBanner";
import { HowTo } from "@/components/HowTo";
import {
  CONTRACT_ADDRESS,
  DEPLOYMENT_BLOCK,
  FALLBACK_COOLDOWN,
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  IS_CONTRACT_CONFIGURED,
  PIXEL_TURF_ABI,
} from "@/lib/contract";
import {
  createBoard,
  fetchPlacementLogs,
  loadInitialBoard,
  pollNewPlacements,
  applyUpdates,
  type BoardState,
} from "@/lib/events";
import { describeTxError, type TxErrorInfo } from "@/lib/errors";
import { TARGET_CHAIN_ID, targetChain, IS_DEV_MODE, DEV_CHAIN_ID } from "@/lib/config";

const POLL_INTERVAL_MS = 8_000;

type LoadPhase = "idle" | "loading" | "ready" | "error";
type TxPhase = "idle" | "preparing" | "pending" | "success" | "error";

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const basePublicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });
  const devPublicClient = usePublicClient({ chainId: DEV_CHAIN_ID });
  // Reads go to the local node only in dev mode; otherwise they always hit
  // Base Sepolia, no matter which network the wallet happens to be on.
  const publicClient =
    (IS_DEV_MODE ? devPublicClient : basePublicClient) ?? basePublicClient;
  const { writeContractAsync } = useWriteContract();

  const [board, setBoard] = useState<BoardState>(() => createBoard(DEPLOYMENT_BLOCK));
  const boardRef = useRef(board);
  boardRef.current = board;
  const [boardVersion, setBoardVersion] = useState(0);
  const bumpBoard = useCallback(() => setBoardVersion((v) => v + 1), []);

  const [loadPhase, setLoadPhase] = useState<LoadPhase>(
    IS_CONTRACT_CONFIGURED ? "loading" : "idle"
  );
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const resumingRef = useRef(false);
  const pollingRef = useRef(false);
  const pollFailedOnceRef = useRef(false);
  const [rpcOk, setRpcOk] = useState(true);

  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const [cooldown, setCooldown] = useState(FALLBACK_COOLDOWN);

  const [color, setColor] = useState("#e4572e");
  const [selected, setSelected] = useState<SelectedTile | null>(null);
  const [zoom, setZoom] = useState(8);

  const [txPhase, setTxPhase] = useState<TxPhase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [txError, setTxError] = useState<TxErrorInfo | null>(null);
  const [cooldownRefresh, setCooldownRefresh] = useState(0);

  // Fit zoom to viewport on first mount.
  useEffect(() => {
    const fit = () => {
      const avail = Math.min(window.innerWidth - 64, 820);
      setZoom(Math.max(4, Math.min(12, Math.floor(avail / (FALLBACK_WIDTH + 2)))));
    };
    fit();
  }, []);

  // Read canvas parameters + cooldown from the deployed contract.
  useEffect(() => {
    if (!IS_CONTRACT_CONFIGURED || !publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        const [w, h, c] = await publicClient.multicall({
          contracts: [
            { address: CONTRACT_ADDRESS, abi: PIXEL_TURF_ABI, functionName: "WIDTH" },
            { address: CONTRACT_ADDRESS, abi: PIXEL_TURF_ABI, functionName: "HEIGHT" },
            { address: CONTRACT_ADDRESS, abi: PIXEL_TURF_ABI, functionName: "COOLDOWN" },
          ],
        });
        if (cancelled) return;
        if (w.result) setWidth(Number(w.result));
        if (h.result) setHeight(Number(h.result));
        if (c.result) setCooldown(Number(c.result));
      } catch {
        /* fallback display constants remain in effect */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  // Initial board reconstruction from contract events (deployment -> latest).
  const startInitialLoad = useCallback(async () => {
    if (!IS_CONTRACT_CONFIGURED || !publicClient) return;
    setLoadPhase("loading");
    setLoadError(null);
    setLoadProgress(0);
    try {
      const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
      const fresh = await loadInitialBoard(publicClient, latest, (f) =>
        setLoadProgress(f)
      );
      boardRef.current = fresh;
      setBoard(fresh);
      bumpBoard();
      setLoadPhase("ready");
      setRpcOk(true);
    } catch (err) {
      const info = describeTxError(err);
      // keep whatever was reconstructed so far and let polling resume it
      const nextFrom = (err as { nextFromBlock?: bigint }).nextFromBlock;
      if (nextFrom !== undefined && boardRef.current.lastProcessedBlock + 1n < nextFrom) {
        boardRef.current.lastProcessedBlock = nextFrom - 1n;
        setBoard({ ...boardRef.current });
      }
      setLoadError(info.message);
      setLoadPhase("error");
      setRpcOk(false);
    }
  }, [bumpBoard, publicClient]);

  useEffect(() => {
    void startInitialLoad();
  }, [startInitialLoad]);

  // Resume an interrupted initial load from where it stopped.
  useEffect(() => {
    if (loadPhase !== "error" || !IS_CONTRACT_CONFIGURED || !publicClient) return;
    const id = setInterval(() => {
      if (resumingRef.current) return;
      resumingRef.current = true;
      (async () => {
        try {
          const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
          const updates = await fetchPlacementLogs(
            publicClient,
            boardRef.current.lastProcessedBlock + 1n,
            latest
          );
          applyUpdates(boardRef.current, updates);
          boardRef.current.lastProcessedBlock = latest;
          setBoard({ ...boardRef.current });
          bumpBoard();
          setLoadPhase("ready");
          setRpcOk(true);
          setLoadError(null);
        } catch {
          /* still failing — the interval will try again */
        } finally {
          resumingRef.current = false;
        }
      })();
    }, 6_000);
    return () => clearInterval(id);
  }, [bumpBoard, loadPhase, publicClient]);

  // Live updates: poll for new placement events without reloading the page.
  useEffect(() => {
    if (loadPhase !== "ready" || !IS_CONTRACT_CONFIGURED || !publicClient) return;
    const id = setInterval(() => {
      if (pollingRef.current) return; // never overlap requests
      pollingRef.current = true;
      (async () => {
        try {
          await pollNewPlacements(publicClient, boardRef.current);
          setBoard({ ...boardRef.current });
          bumpBoard();
          setRpcOk(true);
          pollFailedOnceRef.current = false;
        } catch {
          // temporary RPC failure: keep the current board, retry on next tick
          if (!pollFailedOnceRef.current) {
            pollFailedOnceRef.current = true;
            setRpcOk(false);
          } else {
            setRpcOk(true);
          }
        } finally {
          pollingRef.current = false;
        }
      })();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [bumpBoard, loadPhase, publicClient]);

  const placePixel = useCallback(async () => {
    if (!selected || !IS_CONTRACT_CONFIGURED) return;
    if (!isConnected || !address) {
      setTxPhase("error");
      setTxError({ message: "Connect a wallet first." });
      return;
    }
    if (chainId !== TARGET_CHAIN_ID) {
      setTxPhase("error");
      setTxError({
        message: `Wrong network — please switch your wallet to ${targetChain.name}.`,
      });
      return;
    }

    setTxPhase("preparing");
    setTxError(null);
    setTxHash(undefined);

    const colorInt = parseInt(color.slice(1), 16);
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PIXEL_TURF_ABI,
        functionName: "placePixel",
        args: [selected.x, selected.y, colorInt],
        chainId: TARGET_CHAIN_ID,
      });
      setTxHash(hash);
      setTxPhase("pending");
    } catch (err) {
      const info = describeTxError(err);
      setTxError(info);
      setTxPhase("error");
    }
  }, [address, chainId, color, isConnected, selected, writeContractAsync]);

  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } =
    useWaitForTransactionReceipt({
      hash: txHash,
      query: { enabled: !!txHash },
    });

  useEffect(() => {
    if (txPhase !== "pending") return;
    if (isConfirming) return;
    if (isConfirmed) {
      setTxPhase("success");
      setCooldownRefresh((k) => k + 1);
      // Pull the new event in immediately instead of waiting for the poll tick.
      if (publicClient && boardRef.current) {
        void (async () => {
          try {
            await pollNewPlacements(publicClient, boardRef.current);
            setBoard({ ...boardRef.current });
            bumpBoard();
          } catch {
            /* next poll will pick it up */
          }
        })();
      }
    } else if (receiptError) {
      setTxError(describeTxError(receiptError));
      setTxPhase("error");
    }
  }, [bumpBoard, isConfirmed, isConfirming, publicClient, receiptError, txPhase]);

  const paintedCount = board.tiles.size;
  const wrongNetwork = isConnected && chainId !== TARGET_CHAIN_ID;

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">Pixel Turf</h1>
          <p className="subtitle">A canvas nobody can wipe · shared 100×100 board</p>
        </div>
        <div className="stack">
          <span className="badge badge-testnet">
            Base Sepolia testnet — free play, no real value
          </span>
          <WalletBar />
        </div>
      </header>

      {!IS_CONTRACT_CONFIGURED && (
        <StatusBanner tone="warn">
          Contract address is not configured. Deploy <code>PixelTurf</code> and set{" "}
          <code>NEXT_PUBLIC_CONTRACT_ADDRESS</code> +{" "}
          <code>NEXT_PUBLIC_DEPLOYMENT_BLOCK</code> in{" "}
          <code>frontend/.env.local</code>.
        </StatusBanner>
      )}

      {wrongNetwork && (
        <StatusBanner tone="err">
          Your wallet is on the wrong network. Pixel Turf lives on{" "}
          <strong>{targetChain.name}</strong> (chain id {TARGET_CHAIN_ID}). Use the
          switch button above.
        </StatusBanner>
      )}

      {loadPhase === "error" && (
        <StatusBanner tone="err">
          <strong>Could not load the full canvas from chain.</strong> {loadError} —
          retrying automatically.{" "}
          <button type="button" className="btn btn-compact" onClick={() => void startInitialLoad()}>
            Retry now
          </button>
        </StatusBanner>
      )}

      {loadPhase === "loading" && (
        <StatusBanner tone="info">
          Rebuilding the canvas from on-chain placement events…{" "}
          {Math.round(loadProgress * 100)}%
          <div className="progress" style={{ marginTop: 6 }}>
            <div style={{ width: `${Math.max(3, loadProgress * 100)}%` }} />
          </div>
        </StatusBanner>
      )}

      {loadPhase === "ready" && !rpcOk && (
        <StatusBanner tone="warn">
          RPC hiccup while checking for new pixels — the board you see is still
          correct as of the last successful check; retrying quietly.
        </StatusBanner>
      )}

      {txPhase === "preparing" && (
        <StatusBanner tone="info">Confirm the transaction in your wallet…</StatusBanner>
      )}
      {txPhase === "pending" && txHash && (
        <StatusBanner tone="info">
          Pixel in flight — waiting for the chain…{" "}
          <span className="mono">{txHash.slice(0, 18)}…</span>
        </StatusBanner>
      )}
      {txPhase === "success" && (
        <StatusBanner tone="ok">
          Pixel landed on-chain. The board below already includes it.
        </StatusBanner>
      )}
      {txPhase === "error" && txError && (
        <StatusBanner tone="err">
          {txError.message}
          {txError.isCooldown && " The cooldown is enforced by the contract itself."}{" "}
          <button
            type="button"
            className="btn btn-compact"
            onClick={() => {
              setTxPhase("idle");
              setTxError(null);
            }}
          >
            Dismiss
          </button>
        </StatusBanner>
      )}

      <div className="layout">
        <section className="panel">
          <div className="canvas-toolbar" style={{ marginTop: 0, marginBottom: 10 }}>
            <strong className="mono">
              {width}×{height}
            </strong>
            <span>{paintedCount} pixel{paintedCount === 1 ? "" : "s"} painted</span>
            <span>
              Selected:{" "}
              <span className="coords">
                {selected ? `(${selected.x}, ${selected.y})` : "none — tap a tile"}
              </span>
            </span>
            <span className="zoom-controls">
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => setZoom((z) => Math.max(3, z - 2))}
                aria-label="Zoom out"
              >
                −
              </button>
              <input
                type="range"
                min={3}
                max={16}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Canvas zoom"
              />
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => setZoom((z) => Math.min(16, z + 2))}
                aria-label="Zoom in"
              >
                +
              </button>
            </span>
          </div>

          {loadPhase === "loading" && board.tiles.size === 0 ? (
            <div className="skeleton" aria-hidden="true" />
          ) : (
            <PixelCanvas
              boardVersion={boardVersion}
              getBoard={() => boardRef.current}
              width={width}
              height={height}
              zoom={zoom}
              selected={selected}
              onSelect={setSelected}
            />
          )}

          <div className="canvas-toolbar">
            <ColorPalette color={color} onChange={setColor} />
          </div>
        </section>

        <aside className="panel stack">
          <section>
            <h2>Your turn</h2>
            <CooldownDisplay refreshKey={cooldownRefresh} />
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !IS_CONTRACT_CONFIGURED ||
                  !isConnected ||
                  wrongNetwork ||
                  !selected ||
                  txPhase === "preparing" ||
                  txPhase === "pending" ||
                  loadPhase !== "ready"
                }
                onClick={() => void placePixel()}
              >
                {txPhase === "preparing" || txPhase === "pending"
                  ? "Placing…"
                  : selected
                    ? `Place pixel at (${selected.x}, ${selected.y})`
                    : "Select a tile first"}
              </button>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Cooldown: {cooldown}s per player · enforced on-chain · anyone can paint
              concurrently.
            </p>
          </section>

          <section>
            <h2>How this works</h2>
            <HowTo />
          </section>
        </aside>
      </div>

      <footer className="footer">
        Pixel Turf · contract reads and writes happen on Base Sepolia (chain id{" "}
        {TARGET_CHAIN_ID}) · board state is rebuilt from{" "}
        <code>PixelPlaced</code> events, never from a server
        {IS_CONTRACT_CONFIGURED ? (
          <>
            {" "}· <span className="mono">{CONTRACT_ADDRESS}</span>
          </>
        ) : null}
      </footer>
    </main>
  );
}
