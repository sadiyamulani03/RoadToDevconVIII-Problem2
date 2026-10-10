"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { TARGET_CHAIN_ID, targetChain } from "@/lib/config";

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletBar() {
  const { address, isConnected, status } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const wrongNetwork = isConnected && chainId !== TARGET_CHAIN_ID;
  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];

  return (
    <div className="stack" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {isConnected && address ? (
          <>
            <span
              className={`badge ${wrongNetwork ? "badge-err" : "badge-ok"}`}
              title={wrongNetwork ? "Switch to Base Sepolia" : "Connected"}
            >
              {wrongNetwork
                ? `Wrong network (chain ${chainId})`
                : `Base Sepolia · ${short(address)}`}
            </span>
            {wrongNetwork && (
              <button
                type="button"
                className="btn btn-primary btn-compact"
                onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
                disabled={isSwitching}
              >
                Switch to Base Sepolia
              </button>
            )}
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => connect({ connector: injected })}
            disabled={isPending || status === "reconnecting"}
          >
            {isPending ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>

      {!isConnected && (
        <p className="muted" style={{ margin: 0, textAlign: "right" }}>
          No wallet detected? Install{" "}
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            MetaMask
          </a>{" "}
          or{" "}
          <a href="https://rabby.io/" target="_blank" rel="noreferrer">
            Rabby
          </a>{" "}
          — viewing the canvas needs no wallet at all.
        </p>
      )}
      {error && (
        <p className="muted" style={{ margin: 0, textAlign: "right", color: "var(--err)" }}>
          {error.message.includes("user rejected")
            ? "Connection was rejected in the wallet."
            : error.message}
        </p>
      )}
      <span className="sr-only">Target chain: {targetChain.name}</span>
    </div>
  );
}
