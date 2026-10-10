import { BaseError, ContractFunctionRevertedError } from "viem";

export interface TxErrorInfo {
  /** Short human-readable summary. */
  message: string;
  /** True when the failure is a cooldown revert from the contract. */
  isCooldown?: boolean;
  /** nextPlacementAllowed timestamp from the CooldownActive error, if any. */
  nextAllowedAt?: bigint;
  /** True when the user rejected the request in their wallet. */
  isUserRejection?: boolean;
}

/**
 * Turns a wallet/RPC/contract error into something a human can act on.
 */
export function describeTxError(err: unknown): TxErrorInfo {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name === "CooldownActive") {
        const next = reverted.data?.args?.[0];
        return {
          message: "You are still on cooldown — that pixel can wait a moment.",
          isCooldown: true,
          nextAllowedAt: typeof next === "bigint" ? next : undefined,
        };
      }
      if (name === "InvalidX" || name === "InvalidY" || name === "InvalidColor") {
        return { message: "That coordinate or color is not allowed on this canvas." };
      }
    }
    const short = err.shortMessage || err.message;
    if (/user (rejected|denied)/i.test(short) || /rejected the request/i.test(short)) {
      return { message: "Request rejected in wallet.", isUserRejection: true };
    }
    if (/insufficient funds/i.test(short)) {
      return {
        message:
          "Not enough Base Sepolia ETH for gas. Use a faucet (see instructions) and try again.",
      };
    }
    if (/could not detect network|failed to fetch|network error/i.test(short)) {
      return { message: "Network problem talking to the RPC. It will retry shortly." };
    }
    return { message: short };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}
