// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {PixelTurf} from "../src/PixelTurf.sol";

contract PixelTurfTest is Test {
    PixelTurf internal turf;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant COOLDOWN = 60;

    event PixelPlaced(
        uint32 indexed x, uint32 indexed y, address indexed player, uint32 color, uint256 timestamp
    );

    function setUp() public {
        turf = new PixelTurf();
        vm.warp(1_000_000);
    }

    // ---------------------------------------------------------------------
    // 1 & 2. Placement succeeds and stores the correct color
    // ---------------------------------------------------------------------

    function test_PlacePixel_Success() public {
        vm.prank(alice);
        turf.placePixel(10, 20, 0xFF0000);
        assertEq(turf.tileColor(10, 20), 0xFF0000);
    }

    function test_PlacedTile_StoresCorrectColor() public {
        vm.prank(alice);
        turf.placePixel(0, 0, 0x123456);
        assertEq(turf.tileColor(0, 0), 0x123456);
        assertEq(turf.tileAt(0), 0x123456);

        vm.prank(bob);
        turf.placePixel(99, 99, 0xABCDEF);
        assertEq(turf.tileColor(99, 99), 0xABCDEF);
        // packed index for (99,99) on a 100-wide canvas is 9999
        assertEq(turf.tileAt(9999), 0xABCDEF);
    }

    // ---------------------------------------------------------------------
    // 3. Another player is not blocked by the first player's cooldown
    // ---------------------------------------------------------------------

    function test_AnotherPlayer_NotBlockedByFirstCooldown() public {
        vm.prank(alice);
        turf.placePixel(1, 1, 0xFF0000);

        // bob places immediately, same second as alice
        vm.prank(bob);
        turf.placePixel(2, 2, 0x00FF00);

        assertEq(turf.tileColor(1, 1), 0xFF0000);
        assertEq(turf.tileColor(2, 2), 0x00FF00);
    }

    // ---------------------------------------------------------------------
    // 4 & 5. Same-player cooldown (including exact boundary)
    // ---------------------------------------------------------------------

    function test_SamePlayer_CannotPlaceBeforeCooldown() public {
        vm.prank(alice);
        turf.placePixel(5, 5, 0xFF0000);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PixelTurf.CooldownActive.selector, 1_000_000 + COOLDOWN)
        );
        turf.placePixel(6, 6, 0x00FF00);

        // one second before expiry also reverts
        vm.warp(1_000_000 + COOLDOWN - 1);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PixelTurf.CooldownActive.selector, 1_000_000 + COOLDOWN)
        );
        turf.placePixel(6, 6, 0x00FF00);
    }

    function test_SamePlayer_CanPlaceAtExactCooldownBoundary() public {
        vm.prank(alice);
        turf.placePixel(5, 5, 0xFF0000);

        // exactly at last + COOLDOWN the placement is allowed
        vm.warp(1_000_000 + COOLDOWN);
        vm.prank(alice);
        turf.placePixel(6, 6, 0x00FF00);
        assertEq(turf.tileColor(6, 6), 0x00FF00);
    }

    function test_SamePlayer_CanPlaceAfterCooldown() public {
        vm.prank(alice);
        turf.placePixel(5, 5, 0xFF0000);

        vm.warp(1_000_000 + COOLDOWN + 123);
        vm.prank(alice);
        turf.placePixel(6, 6, 0x00FF00);
        assertEq(turf.tileColor(6, 6), 0x00FF00);
    }

    // ---------------------------------------------------------------------
    // 6. Initial placement works immediately
    // ---------------------------------------------------------------------

    function test_InitialPlacement_Immediate() public {
        // no previous placement, no waiting required
        vm.prank(alice);
        turf.placePixel(50, 50, 0x0000FF);
        assertEq(turf.tileColor(50, 50), 0x0000FF);

        assertTrue(turf.canPlace(bob));
        vm.prank(bob);
        turf.placePixel(51, 51, 0x0000FF);
    }

    // ---------------------------------------------------------------------
    // 7 & 8. Bounds checks
    // ---------------------------------------------------------------------

    function test_OutOfBoundsX_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidX.selector, 100));
        turf.placePixel(100, 0, 0xFF0000);

        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidX.selector, 4096));
        turf.placePixel(4096, 50, 0xFF0000);

        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidX.selector, type(uint32).max));
        turf.placePixel(type(uint32).max, 0, 0xFF0000);
    }

    function test_OutOfBoundsY_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidY.selector, 100));
        turf.placePixel(0, 100, 0xFF0000);

        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidY.selector, 9999));
        turf.placePixel(50, 9999, 0xFF0000);

        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidY.selector, type(uint32).max));
        turf.placePixel(0, type(uint32).max, 0xFF0000);
    }

    function test_InvalidColor_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidColor.selector, 0x1000000));
        turf.placePixel(0, 0, 0x1000000);

        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidColor.selector, type(uint32).max));
        turf.placePixel(0, 0, type(uint32).max);
    }

    function test_BoundaryCoordinates_CornersWork() public {
        vm.startPrank(alice);
        turf.placePixel(0, 0, 0x000001);
        vm.warp(block.timestamp + COOLDOWN);
        turf.placePixel(99, 0, 0x000002);
        vm.warp(block.timestamp + COOLDOWN);
        turf.placePixel(0, 99, 0x000003);
        vm.warp(block.timestamp + COOLDOWN);
        turf.placePixel(99, 99, 0x000004);
        vm.stopPrank();

        assertEq(turf.tileColor(0, 0), 0x000001);
        assertEq(turf.tileColor(99, 0), 0x000002);
        assertEq(turf.tileColor(0, 99), 0x000003);
        assertEq(turf.tileColor(99, 99), 0x000004);
    }

    function test_OutOfBoundsTileAt_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidX.selector, 10_000));
        turf.tileAt(10_000);
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidX.selector, type(uint32).max));
        turf.tileAt(type(uint32).max);
    }

    // ---------------------------------------------------------------------
    // 10. Event contains correct position, color, player
    // ---------------------------------------------------------------------

    function test_PlacementEvent_EmitsCorrectData() public {
        vm.expectEmit(true, true, true, true, address(turf));
        emit PixelPlaced(12, 34, alice, 0xDEAD05, 1_000_000);
        vm.prank(alice);
        turf.placePixel(12, 34, 0xDEAD05);
    }

    // ---------------------------------------------------------------------
    // 11. Last-placement timestamp updated correctly
    // ---------------------------------------------------------------------

    function test_LastPlacementTimestamp_Updated() public {
        assertEq(turf.lastPlacement(alice), 0);
        assertEq(turf.nextPlacementAllowed(alice), 0);

        vm.prank(alice);
        turf.placePixel(1, 1, 0xFF0000);
        assertEq(turf.lastPlacement(alice), 1_000_000);
        assertEq(turf.nextPlacementAllowed(alice), 1_000_000 + COOLDOWN);

        vm.warp(1_000_000 + COOLDOWN);
        vm.prank(alice);
        turf.placePixel(2, 2, 0x00FF00);
        assertEq(turf.lastPlacement(alice), 1_000_000 + COOLDOWN);
        assertEq(turf.nextPlacementAllowed(alice), 1_000_000 + 2 * COOLDOWN);
    }

    function test_CanPlace_ReflectsCooldown() public {
        assertTrue(turf.canPlace(alice));
        vm.prank(alice);
        turf.placePixel(1, 1, 0xFF0000);
        assertFalse(turf.canPlace(alice));
        vm.warp(1_000_000 + COOLDOWN);
        assertTrue(turf.canPlace(alice));
    }

    // ---------------------------------------------------------------------
    // 12. One player's placement does not change another's cooldown
    // ---------------------------------------------------------------------

    function test_CooldownState_PerPlayerIndependent() public {
        vm.prank(alice);
        turf.placePixel(1, 1, 0xFF0000);

        assertEq(turf.lastPlacement(alice), 1_000_000);
        assertEq(turf.lastPlacement(bob), 0);
        assertTrue(turf.canPlace(bob));

        vm.prank(bob);
        turf.placePixel(2, 2, 0x00FF00);

        // alice's cooldown unchanged by bob's action
        assertEq(turf.lastPlacement(alice), 1_000_000);
        assertEq(turf.lastPlacement(bob), 1_000_000);
        assertFalse(turf.canPlace(alice));
        assertFalse(turf.canPlace(bob));
    }

    // ---------------------------------------------------------------------
    // 13. No reset or privileged tile-writing method exists
    // ---------------------------------------------------------------------

    function test_NoResetOrPrivilegedMethod() public {
        vm.prank(alice);
        turf.placePixel(1, 1, 0xFF0000);

        bytes memory noArgs = "";
        bytes memory oneAddr = abi.encodeWithSignature("setOwner(address)", alice);
        bytes memory resetSel = abi.encodeWithSignature("reset()");
        bytes memory clearSel = abi.encodeWithSignature("clear()");
        bytes memory clearAllSel = abi.encodeWithSignature("clearAll()");
        bytes memory wipeSel = abi.encodeWithSignature("wipe()");
        bytes memory setTileSel = abi.encodeWithSignature("setTile(uint32,uint32,uint32)", 1, 1, 0);
        bytes memory adminSel =
            abi.encodeWithSignature("adminSetTile(uint32,uint32,uint32)", 1, 1, 0);
        bytes memory batchSel =
            abi.encodeWithSignature("batchPlace((uint32,uint32,uint32)[])", new bytes(0x60));
        bytes memory renounceSel = abi.encodeWithSignature("renounceOwnership()");
        bytes memory transferSel = abi.encodeWithSignature("transferOwnership(address)", alice);

        // every call to a non-existent selector reverts at the callee
        (bool ok,) = address(turf).call(noArgs);
        assertFalse(ok);
        (ok,) = address(turf).call(oneAddr);
        assertFalse(ok);
        (ok,) = address(turf).call(resetSel);
        assertFalse(ok);
        (ok,) = address(turf).call(clearSel);
        assertFalse(ok);
        (ok,) = address(turf).call(clearAllSel);
        assertFalse(ok);
        (ok,) = address(turf).call(wipeSel);
        assertFalse(ok);
        (ok,) = address(turf).call(setTileSel);
        assertFalse(ok);
        (ok,) = address(turf).call(adminSel);
        assertFalse(ok);
        (ok,) = address(turf).call(batchSel);
        assertFalse(ok);
        (ok,) = address(turf).call(renounceSel);
        assertFalse(ok);
        (ok,) = address(turf).call(transferSel);
        assertFalse(ok);

        // tile untouched by all the failed probes
        assertEq(turf.tileColor(1, 1), 0xFF0000);
    }

    function test_ContractHasNoOwnerStorageSlot() public {
        // storage layout: slot 0 = _tiles mapping, slot 1 = lastPlacement mapping.
        // An owner slot would appear at slot 2 with a non-zero value after
        // hypothetical ownership initialization — it must stay empty.
        assertEq(vm.load(address(turf), bytes32(uint256(2))), bytes32(0));
    }

    // ---------------------------------------------------------------------
    // 14. Placement updates only the selected tile
    // ---------------------------------------------------------------------

    function test_UpdatesOnlySelectedTile() public {
        vm.prank(alice);
        turf.placePixel(10, 10, 0xFF0000);
        vm.prank(bob);
        turf.placePixel(50, 50, 0x00FF00);

        // neighbors of alice's tile untouched
        assertEq(turf.tileColor(9, 10), 0);
        assertEq(turf.tileColor(11, 10), 0);
        assertEq(turf.tileColor(10, 9), 0);
        assertEq(turf.tileColor(10, 11), 0);
        assertEq(turf.tileColor(50, 50), 0x00FF00);

        // re-painting a tile changes only that tile
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(carol);
        turf.placePixel(10, 10, 0x0000FF);
        assertEq(turf.tileColor(10, 10), 0x0000FF);
        assertEq(turf.tileColor(50, 50), 0x00FF00);
    }

    // ---------------------------------------------------------------------
    // 15. Placement work independent of canvas dimensions
    // ---------------------------------------------------------------------

    function test_PlacementGas_Bounded() public {
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        turf.placePixel(42, 42, 0xCAFEB0);
        uint256 gasUsed = gasBefore - gasleft();

        // A single SSTORE + timestamp + event is O(1). Even at a 1000x1000
        // canvas this cost would be identical; a linear scan of the canvas
        // would cost millions of gas.
        assertLt(gasUsed, 80_000);
    }

    // ---------------------------------------------------------------------
    // Fuzz tests
    // ---------------------------------------------------------------------

    function testFuzz_RoundTripWithinBounds(uint32 xSeed, uint32 ySeed, uint32 color) public {
        uint32 x = xSeed % 100;
        uint32 y = ySeed % 100;
        color = color & 0xFFFFFF;

        vm.prank(alice);
        turf.placePixel(x, y, color);
        assertEq(turf.tileColor(x, y), color);
    }

    function testFuzz_OutOfBoundsXReverts(uint32 x) public {
        vm.assume(x >= 100);
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidX.selector, x));
        turf.placePixel(x, 0, 0xFF0000);
    }

    function testFuzz_OutOfBoundsYReverts(uint32 y) public {
        vm.assume(y >= 100);
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidY.selector, y));
        turf.placePixel(0, y, 0xFF0000);
    }

    function testFuzz_InvalidColorReverts(uint32 color) public {
        vm.assume(color > 0xFFFFFF);
        vm.expectRevert(abi.encodeWithSelector(PixelTurf.InvalidColor.selector, color));
        turf.placePixel(0, 0, color);
    }

    function testFuzz_CooldownEnforcedForSender(uint256 warpDelta) public {
        warpDelta = bound(warpDelta, 0, COOLDOWN - 1);
        vm.prank(alice);
        turf.placePixel(1, 1, 0xFF0000);

        vm.warp(1_000_000 + warpDelta);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PixelTurf.CooldownActive.selector, 1_000_000 + COOLDOWN)
        );
        turf.placePixel(2, 2, 0x00FF00);

        // a different sender is free to paint in the same instant
        vm.prank(bob);
        turf.placePixel(2, 2, 0x00FF00);
    }

    // ---------------------------------------------------------------------
    // Event reconstruction sanity check (chronological replay)
    // ---------------------------------------------------------------------

    function test_EventsSufficientForReconstruction() public {
        vm.recordLogs();

        vm.prank(alice);
        turf.placePixel(1, 2, 0x111111);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(bob);
        turf.placePixel(1, 2, 0x222222);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(alice);
        turf.placePixel(3, 4, 0x333333);

        Vm.Log[] memory entries = vm.getRecordedLogs();
        assertEq(entries.length, 3);

        // replay logs chronologically into an in-memory tile map
        mapping(uint32 => uint32) storage replay = _replaySlots();
        for (uint256 i = 0; i < entries.length; i++) {
            bytes32 sig = entries[i].topics[0];
            assertEq(sig, PixelTurf.PixelPlaced.selector);
            uint32 x = uint32(uint256(entries[i].topics[1]));
            uint32 y = uint32(uint256(entries[i].topics[2]));
            (uint32 color,) = abi.decode(entries[i].data, (uint32, uint256));
            replay[y * 100 + x] = color;
        }

        // latest event wins for a re-painted tile
        assertEq(replay[2 * 100 + 1], 0x222222);
        assertEq(replay[4 * 100 + 3], 0x333333);
        // replay matches live contract state
        assertEq(replay[2 * 100 + 1], turf.tileColor(1, 2));
        assertEq(replay[4 * 100 + 3], turf.tileColor(3, 4));
    }

    /// @dev storage pointer helper so the replay test can use a real mapping
    mapping(uint32 => uint32) internal _replay;

    function _replaySlots() internal view returns (mapping(uint32 => uint32) storage) {
        return _replay;
    }
}
