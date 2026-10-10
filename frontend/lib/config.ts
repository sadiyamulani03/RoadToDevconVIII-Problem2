import { http, createConfig, type Config } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Pixel Turf targets Base Sepolia (chain id 84532) exclusively in normal use.
 *
 * NEXT_PUBLIC_DEV_RPC_URL exists only so developers can point the app at a
 * local Anvil node (chain id 31337) for smoke tests. When the variable is
 * unset — the default — the app is configured with Base Sepolia alone.
 */
const DEV_RPC_URL = process.env.NEXT_PUBLIC_DEV_RPC_URL;

const devChain = {
  id: 31337,
  name: "Anvil (local dev)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [DEV_RPC_URL || "http://127.0.0.1:8545"] } },
} as const;

export const targetChain = baseSepolia;
export const TARGET_CHAIN_ID = baseSepolia.id; // 84532 — Base Sepolia

/** True when the app is pointed at a local Anvil node for development. */
export const IS_DEV_MODE = Boolean(DEV_RPC_URL);
export const DEV_CHAIN_ID = devChain.id;

export const chains = DEV_RPC_URL
  ? ([baseSepolia, devChain] as const)
  : ([baseSepolia] as const);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";

export const wagmiConfig: Config = createConfig({
  chains,
  connectors: [injected()],
  // Both transports are always declared so the config type-checks whether or
  // not the dev chain is enabled; only chains listed above are reachable.
  transports: {
    [baseSepolia.id]: http(RPC_URL),
    [devChain.id]: http(DEV_RPC_URL || "http://127.0.0.1:8545"),
  },
  ssr: true,
});
