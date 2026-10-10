// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PixelTurf} from "../src/PixelTurf.sol";

/// @notice Deploys PixelTurf to Base Sepolia.
/// @dev Usage:
///   export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
///   export PRIVATE_KEY=0x...        # testnet-only key with a little Sepolia ETH
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
contract Deploy is Script {
    function run() external returns (PixelTurf turf) {
        // Refuse to run without an explicit private key in the environment —
        // never hard-code credentials.
        vm.envUint("PRIVATE_KEY");

        vm.startBroadcast();
        turf = new PixelTurf();
        vm.stopBroadcast();

        console2.log("PixelTurf deployed at:", address(turf));
        console2.log("WIDTH:", turf.WIDTH());
        console2.log("HEIGHT:", turf.HEIGHT());
        console2.log("COOLDOWN (seconds):", turf.COOLDOWN());
    }
}
