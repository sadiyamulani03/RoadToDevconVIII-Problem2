"use client";

export function HowTo() {
  return (
    <details className="instructions">
      <summary>New here? How to paint your first pixel</summary>
      <ol>
        <li>
          <strong>Get a wallet</strong> — install{" "}
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            MetaMask
          </a>{" "}
          (free). It holds your test ETH and signs your pixels.
        </li>
        <li>
          <strong>Switch to Base Sepolia</strong> — this app uses a public test
          network. It is free to join and has no real-money value. The button up
          top will switch your wallet for you.
        </li>
        <li>
          <strong>Grab free test ETH</strong> — use a Base Sepolia faucet such as{" "}
          <a href="https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet" target="_blank" rel="noreferrer">
            Coinbase&apos;s faucet
          </a>{" "}
          or{" "}
          <a href="https://faucets.quicknode.com/base/sepolia" target="_blank" rel="noreferrer">
            QuickNode&apos;s
          </a>
          . A single pixel costs only a tiny amount of gas.
        </li>
        <li>
          <strong>Pick a color, tap a tile, press Place</strong> — each player
          may place one pixel every 60 seconds. Everyone&apos;s pixels share the
          same permanent canvas.
        </li>
        <li>
          <strong>Watch it land</strong> — the board refreshes live from chain
          events, so you will see other painters too.
        </li>
      </ol>
      <p className="muted" style={{ margin: 0 }}>
        Nothing here costs real money, and nobody — not even a contract admin —
        can wipe the canvas once painted.
      </p>
    </details>
  );
}
