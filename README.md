# Pixel Turf — A Canvas Nobody Can Wipe

A shared **100 × 100 pixel canvas** on **Base Sepolia** (chain id **84532**). Anyone with a
wallet can paint a pixel; a **60-second per-player cooldown** keeps it fair; and the contract
has **no owner, no admin, no reset, and no batch path** — once a pixel is down, nobody
(not even the deployer) can wipe the canvas.

## The problem being solved

Collaborative pixel boards usually depend on a server that owns the state — and servers can
be reset, censored, or switched off by whoever operates them. Pixel Turf moves the canvas
into a smart contract:

* The board state lives on-chain in a per-tile mapping.
* Every placement emits an event, so anyone can rebuild the exact board from chain history.
* Fairness (cooldown, bounds) is enforced inside the contract — the frontend is just a view.
* There is no privileged function of any kind, so there is no privileged erasure.

> **Important distinction:** preventing *privileged erasure* (this contract has no function
> that can clear tiles) is not the same as guaranteeing *permanent availability*. The canvas
> remains readable only as long as the chain it lives on exists and someone will serve its
> data. Base Sepolia is a **test network** that may eventually be deprecated — a mainnet
> deployment would carry stronger longevity expectations.

## Architecture

```
┌──────────────────────┐   write: placePixel(x, y, color)   ┌──────────────────────┐
│  Next.js frontend    │ ─────────────────────────────────▶ │  PixelTurf contract  │
│  (React, wagmi/viem) │ ◀───────────────────────────────── │  on Base Sepolia     │
│  HTML canvas render  │   read: WIDTH/HEIGHT/COOLDOWN,     │  100×100 tile map    │
└──────────────────────┘   nextPlacementAllowed, canPlace   └──────────────────────┘
           │                            ▲
           │ initial board: eth_getLogs │ PixelPlaced events
           │ (deployment block → head)  │ (also used for live polling)
           ▼                            │
     in-memory tile map  ───────────────┘
```

* **Contract** (`src/PixelTurf.sol`) — stores one `uint32` color per packed tile index and one
  last-placement timestamp per player. The only state-changing function is `placePixel`.
* **Frontend** (`frontend/`) — a Next.js app that renders the board on an HTML `<canvas>`,
  rebuilds it from `PixelPlaced` events, polls for new events, and writes pixels through the
  player's wallet (injected: MetaMask, Rabby, Coinbase Wallet, …).
* **No backend.** The browser talks straight to Base Sepolia through a public RPC. There is
  no server that could alter, reset, or censor the canvas.

### Data flow

1. On page load the app fetches `PixelPlaced` logs from the **deployment block** to the
   **chain head** (split into 5,000-block chunks to respect public RPC log-range limits),
   sorts them by `(blockNumber, logIndex)`, and applies them to an in-memory
   `Map<packedIndex, {x, y, color, player}>` — **latest event wins** for a re-painted tile.
2. Every 8 seconds the app polls `eth_getLogs` for blocks after its last processed block and
   applies only the new events (no page reload, no full rebuild, no overlapping requests).
3. Placing a pixel sends a normal wallet transaction; on confirmation the board and the
   cooldown display are refreshed immediately.

## Contract design and fairness rules

| Rule | How it is enforced |
| --- | --- |
| Per-player cooldown (60 s) | `lastPlacement[msg.sender]` compared to `block.timestamp`; revert `CooldownActive(nextAllowedAt)`. Initial placement (`last == 0`) is always allowed. |
| Sender identity | Cooldown state is keyed by `msg.sender` — nobody can supply a different address or overwrite another player's entry. |
| Bounds | `x >= WIDTH` → `InvalidX`; `y >= HEIGHT` → `InvalidY`; color `> 0xFFFFFF` → `InvalidColor`. |
| Single-tile update | One SSTORE to `_tiles[y * WIDTH + x]` — O(1), no loops, independent of canvas size. |
| Event for reconstruction | `PixelPlaced(uint32 indexed x, uint32 indexed y, address indexed player, uint32 color, uint256 timestamp)` carries everything needed to replay the canvas. |
| No privileged erasure | `placePixel` is the only function that writes tile state. There is no owner, admin, batch, reset, clear, emergency, or upgrade mechanism. |
| Cooldown views for the UI | `lastPlacement(address)`, `nextPlacementAllowed(address)`, `canPlace(address)` — the frontend countdown always starts from these on-chain values. |

* **Canvas size:** `WIDTH = 100`, `HEIGHT = 100` (10,000 tiles).
* **Cooldown:** `COOLDOWN = 60` seconds per player, contract-enforced.
* **Colors:** `0xRRGGBB`; `0x000000` (black) is a legitimate paint, not an erase.

## Repository layout

```
src/PixelTurf.sol          # the contract
test/PixelTurf.t.sol       # Foundry test suite (26 tests)
script/Deploy.s.sol        # Base Sepolia deployment script
frontend/                  # Next.js app (wagmi + viem + canvas)
  app/page.tsx             # main UI: board, palette, placement flow
  components/              # PixelCanvas, CooldownDisplay, WalletBar, …
  lib/events.ts            # event reconstruction + live polling
  lib/contract.ts          # ABI + address + deployment block
  scripts/verify-events.ts # integration check against a local Anvil node
```

## Smart contract: setup, tests, deployment

Requirements: [Foundry](https://getfoundry.sh/) (tested with forge 1.8.1, solc 0.8.28).

```bash
forge build          # compile
forge test           # run the full test suite
forge fmt --check    # formatting check
```

The test suite covers: successful placement and stored color; independent per-player
cooldowns; cooldown reverts before, and success at, the exact expiry boundary; immediate
initial placement; out-of-bounds X/Y/color reverts (including fuzz tests); corner
coordinates; event contents (position, color, player); timestamp bookkeeping; isolation of
one player's cooldown from another's; absence of any reset/privileged selector; single-tile
updates; O(1) placement gas; and a full event-replay reconstruction check.

### Deploying to Base Sepolia

```bash
cp .env.example .env      # then fill in:
#   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org   (or your own RPC)
#   PRIVATE_KEY=0x…        # TESTNET-ONLY throwaway key, funded with Base Sepolia ETH
#   BASESCAN_API_KEY=…     # optional, for --verify
source .env
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

The script refuses to run without `PRIVATE_KEY` in the environment — nothing is ever
hard-coded. After deployment, put the address and deployment block into
`frontend/.env.local` (see below).

**Contract deployment status: not deployed.** Deploying requires a funded, testnet-only
`PRIVATE_KEY` (plus optional `BASESCAN_API_KEY` for verification); none was available in the
environment where this README was last updated, so no contract address is claimed here.

| Item | Value |
| --- | --- |
| Contract address | _(not deployed yet — placeholder)_ |
| Deployment tx | _(pending)_ |
| Explorer link | _(pending)_ |

## Frontend

Requirements: Node.js 20+ (tested with v22 / npm 10).

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # production build
npm run sync-abi     # re-copy the ABI from out/PixelTurf.sol after contract changes
```

### Environment variables

`frontend/.env.local` (copy from `frontend/.env.example`) — **public values only**:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0x…   # deployed PixelTurf address
NEXT_PUBLIC_DEPLOYMENT_BLOCK=…     # block of the deployment tx (event-history start)
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
# optional, local development only:
# NEXT_PUBLIC_DEV_RPC_URL=http://127.0.0.1:8545   # enables a local Anvil chain in the UI
```

The root `.env` (deployment only, never committed) holds `PRIVATE_KEY`,
`BASE_SEPOLIA_RPC_URL`, `BASESCAN_API_KEY`. Both `.env` and `.env.local` are gitignored;
`.env.example` files contain placeholders only.

### Live hosting (Vercel)

The frontend is deployed on Vercel: **https://pixel-turf-swart.vercel.app**

Until `NEXT_PUBLIC_CONTRACT_ADDRESS` and `NEXT_PUBLIC_DEPLOYMENT_BLOCK` are set in the
Vercel project, the page intentionally shows a "contract address is not configured" banner
instead of pretending to show chain data. After deploying the contract, connect it with:

```bash
cd frontend
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production   # the deployed address
vercel env add NEXT_PUBLIC_DEPLOYMENT_BLOCK production   # the deployment block number
vercel --prod                                            # rebuild + redeploy
```

Without `NEXT_PUBLIC_CONTRACT_ADDRESS` the UI still renders and explains that the contract
is not configured yet — it never pretends to show chain data it cannot fetch.

### How the canvas loads and stays live

* **Initial reconstruction** — `eth_getLogs` for `PixelPlaced` from the deployment block to
  the head, chunked into 5,000-block requests, replayed in `(block, logIndex)` order. A tile
  painted many times shows the color of its **latest** event. No per-tile `eth_call`, no
  local storage as source of truth, no reliance on "the last event".
* **Live updates** — an 8-second poll of logs after the last processed block; a request-in-
  flight lock prevents overlap; the board mutates in memory (O(new events)), never a full
  rebuild; transient RPC failures flip a quiet warning and self-heal on the next tick.
  (`cacheTime: 0` on head reads — a cached head right after a placement could otherwise
  hide its event; this was caught by the local integration check.)
* **Cooldown display** — read from `nextPlacementAllowed(player)` and `canPlace(player)` on
  chain, refreshed every 10 s, after every placement, and on account change. A local timer
  animates the countdown between refreshes, corrected by measured chain-clock skew — but the
  on-chain value is always the source of truth; the contract, not the UI, enforces the rule.
* **Wallet & network** — viewing needs no wallet. Painting needs an injected wallet on
  Base Sepolia (84532); the UI detects the wrong network and offers a one-click switch.
  Errors (rejection, wrong network, insufficient test ETH, cooldown revert, invalid
  coordinates, RPC hiccups, reverted transactions) are surfaced in plain language, and a
  success banner only appears after the transaction is actually confirmed.

### Local integration check (event reconstruction + polling)

With [Anvil](https://getfoundry.sh/) running:

```bash
anvil                     # terminal 1
cd .. && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --private-key <anvil-key-0> --broadcast
cd frontend
PIXEL_TURF_ADDRESS=0x… PIXEL_TURF_DEPLOY_BLOCK=1 npm run verify-events
```

This exercises the exact `lib/events.ts` code path the browser uses: paint several pixels
(including a re-paint), rebuild the board purely from events, then place one more pixel and
assert the live poll applies exactly that event. It uses Anvil's unlocked accounts —
**no private keys appear anywhere in this repository**.

## Gas sponsorship status

Placing a pixel is a **normal wallet transaction** and therefore costs a small amount of
Base Sepolia test ETH (typically well under a cent's worth on the testnet). This app does
**not** pretend that deployment to Base Sepolia makes transactions free.

Genuine sponsorship (a paymaster paying gas for players) was **not implemented**, because it
cannot be completed or verified with the configuration available here:

* Base Account / paymaster sponsorship requires a **CDP API key (or equivalent paymaster
  credential)** that must live **server-side** — embedding it in the browser bundle would
  leak it, and this project deliberately has no backend.
* Implementing it honestly means adding a small backend endpoint that holds the credential
  and submits sponsored UserOperations (or a `eth_sendUserOp`-style relayer), while the
  contract keeps enforcing the same cooldown and bounds for the sponsoring account path.

To add it later: create a Base-sponsored-smart-wallet/paymaster config in the Base
dashboard, deploy a minimal server-side sponsor endpoint (env-held key, rate-limited by the
on-chain cooldown), and have the frontend route `placePixel` through it. Until then, users
need faucet ETH — the in-app instructions link to Coinbase and QuickNode Base Sepolia
faucets.

## Acceptance-check audit

Executed results (not claims): `forge fmt --check`, `forge build`, `forge test` (26/26),
`npm run typecheck`, `npm run lint`, `npm run build`, and `npm run verify-events` against a
local Anvil deployment were all run in this environment; details below.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Frontend targets Base Sepolia (84532) | **PASS** | `frontend/lib/config.ts` imports `baseSepolia` from `wagmi/chains`; `TARGET_CHAIN_ID = 84532`; wrong-network banner + switch in `app/page.tsx`, `components/WalletBar.tsx` |
| 2 | No credentials in tracked files | **PASS** | No `.env` committed (`.gitignore` covers `.env*`); `.env.example` files hold placeholders only; hardcoded Anvil *keys* were removed from `scripts/verify-events.ts` (public addresses only); repo-wide scan for `PRIVATE_KEY=0x`, mnemonics, API-key patterns finds nothing |
| 3 | Contract-enforced sender cooldown | **PASS** | `src/PixelTurf.sol` `placePixel`: `lastPlacement[msg.sender]` gate; tests `test_SamePlayer_*`, `testFuzz_CooldownEnforcedForSender` (256 runs) |
| 4 | Contract-enforced bounds | **PASS** | `InvalidX`/`InvalidY`/`InvalidColor` reverts incl. fuzz tests and packed-index `tileAt` bounds |
| 5 | Only the player placement path writes tiles | **PASS** | `placePixel` is the sole storage-writing function; `test_NoResetOrPrivilegedMethod` probes reset/clear/wipe/setTile/admin/batch/ownership selectors and storage layout |
| 6 | Placement event contains position | **PASS** | `PixelPlaced(x, y, player, color, timestamp)`; `test_PlacementEvent_EmitsCorrectData` |
| 7 | Efficient initial canvas loading | **PASS** | `lib/events.ts` rebuilds from chunked `eth_getLogs`, never per-tile reads; verified end-to-end by `npm run verify-events` (9/9 assertions) on Anvil |
| 8 | Placement work independent of canvas size | **PASS** | Single SSTORE + timestamp + event, no loops; `test_PlacementGas_Bounded` (< 80k gas) |
| 9 | Live updates without reload | **PASS** | 8-second incremental log polling with overlap lock (`app/page.tsx`, `lib/events.ts`); `verify-events` proves a new placement is applied without reload |
| 10 | Cooldown display comes from the contract | **PASS** | `components/CooldownDisplay.tsx` reads `nextPlacementAllowed` + `canPlace` from the contract; local timer only animates between on-chain refreshes |

## Known limitations

* **Testnet** — Base Sepolia may be deprecated; state there is not permanent history.
* **Public RPC** — heavy traffic can hit log-range or rate limits; the app chunks requests
  and retries, but a dedicated RPC URL (`NEXT_PUBLIC_RPC_URL`) is recommended.
* **No gas sponsorship yet** — players need faucet ETH (see above).
* **Black is paint, not erase** — there is intentionally no erase operation; a black pixel
  simply covers the tile.
* **Canvas size is fixed** at 100 × 100 in the contract; changing it would need a new
  deployment.

## Demo workflow

1. `cd frontend && npm install && npm run dev`, open http://localhost:3000.
2. Browse the canvas — it rebuilds itself from chain events with no wallet connected.
3. Connect an injected wallet, switch to Base Sepolia (button in the header), grab faucet
   ETH (links in “How this works”).
4. Pick a color, tap a tile (coordinates shown), press **Place pixel**, confirm in the
   wallet. Watch the pending → confirmed banner and the pixel appear — plus your cooldown
   countdown start.
5. Open the page on a second browser/incognito: the same canvas appears from events alone,
   and another wallet can paint concurrently (its own cooldown).

## License

MIT
