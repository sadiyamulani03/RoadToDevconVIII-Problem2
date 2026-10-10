import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // ESLint runs separately via `npm run lint` so builds stay deterministic.
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // `wagmi/connectors` re-exports every connector, and the Base Account /
    // Coinbase connectors pull in SDKs (`@base-org/account`,
    // `@coinbase/cdp-sdk`, `@x402/*`) with optional dependencies that are not
    // installed. We only use the `injected` connector, so alias the unused
    // SDKs to empty modules: the bundle builds without extra packages, and
    // the aliased code paths are never executed.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
      "@x402/evm": false,
      "@x402/svm": false,
      // Optional peers of the unused MetaMask SDK / WalletConnect logger:
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
