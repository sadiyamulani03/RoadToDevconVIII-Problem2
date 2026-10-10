"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESS, FALLBACK_COOLDOWN, IS_CONTRACT_CONFIGURED, PIXEL_TURF_ABI } from "@/lib/contract";
import { TARGET_CHAIN_ID } from "@/lib/config";

interface Props {
  /** Bump this after a placement so the cooldown is re-read from chain. */
  refreshKey: number;
}

/**
 * Displays the connected player's cooldown, sourced from the contract's
 * `nextPlacementAllowed` / `lastPlacement` views. A local timer animates the
 * countdown between refreshes, but the on-chain value is always the truth:
 * it is refetched every 10 seconds and after every placement.
 */
export function CooldownDisplay({ refreshKey }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [skew, setSkew] = useState(0);

  const { data, refetch, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: CONTRACT_ADDRESS,
        abi: PIXEL_TURF_ABI,
        functionName: "nextPlacementAllowed",
        args: address ? [address] : undefined,
        chainId: TARGET_CHAIN_ID,
      },
      {
        address: CONTRACT_ADDRESS,
        abi: PIXEL_TURF_ABI,
        functionName: "canPlace",
        args: address ? [address] : undefined,
        chainId: TARGET_CHAIN_ID,
      },
    ],
    query: {
      enabled: IS_CONTRACT_CONFIGURED && isConnected && !!address && chainId === TARGET_CHAIN_ID,
      refetchInterval: 10_000,
    },
  });

  useEffect(() => {
    void refetch();
  }, [refreshKey, address, refetch]);

  // Local clock skew vs. the chain, so the countdown is honest about time.
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    const measure = async () => {
      try {
        const block = await publicClient.getBlockNumber({ cacheTime: 0 });
        const b = await publicClient.getBlock({ blockNumber: block });
        if (!cancelled) {
          setSkew(Math.floor(Date.now() / 1000) - Number(b.timestamp));
        }
      } catch {
        /* keep previous skew on RPC failure */
      }
    };
    void measure();
    const id = setInterval(() => void measure(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [publicClient, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!IS_CONTRACT_CONFIGURED) {
    return <p className="muted">Contract address not configured yet.</p>;
  }
  if (!isConnected) {
    return <p className="muted">Connect a wallet to see your personal cooldown.</p>;
  }
  if (chainId !== TARGET_CHAIN_ID) {
    return <p className="muted">Switch to Base Sepolia to paint.</p>;
  }

  const nextAllowed = (data?.[0]?.result as bigint | undefined) ?? undefined;
  const canPlaceNow = (data?.[1]?.result as boolean | undefined) ?? undefined;

  if (isLoading && nextAllowed === undefined) {
    return <p className="muted">Reading cooldown from the contract…</p>;
  }
  if (error && nextAllowed === undefined) {
    return <p className="muted">Cooldown read failed — retrying automatically.</p>;
  }

  const ready =
    canPlaceNow === true ||
    (nextAllowed !== undefined && (nextAllowed === 0n || now - skew >= Number(nextAllowed)));

  if (ready) {
    return (
      <div>
        <span className="badge badge-ok">Ready to paint</span>
        <p className="muted" style={{ marginBottom: 0 }}>
          Your next pixel can go down right now.
        </p>
      </div>
    );
  }

  const remaining =
    nextAllowed !== undefined
      ? Math.max(0, Number(nextAllowed) - (now - skew))
      : FALLBACK_COOLDOWN;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div>
      <span className="badge badge-muted">On cooldown</span>
      <div className="countdown" aria-live="polite">
        {mm}:{ss}
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        One pixel per player every {FALLBACK_COOLDOWN}s (contract-enforced). You can paint
        again at <span className="coords">{remaining}s</span>.
      </p>
    </div>
  );
}
