// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PixelTurf — A Canvas Nobody Can Wipe
/// @notice A shared 100x100 pixel canvas on Base Sepolia.
///
/// Fairness rules enforced on-chain:
/// * Any address may place a pixel at a valid coordinate.
/// * Each player has an independent cooldown keyed by `msg.sender`.
/// * Coordinates outside the canvas revert.
/// * The player placement function is the ONLY function that writes tile
///   state. There is no owner, no admin, no reset, no batch placement and no
///   cooldown bypass of any kind.
/// * The canvas can be fully reconstructed from `PixelPlaced` events.
///
/// @dev Preventing privileged erasure (no reset/admin functions exist in this
/// contract) is distinct from guaranteeing permanent blockchain availability.
/// This contract cannot wipe its own canvas, but the continued availability of
/// the canvas still depends on the underlying chain (Base Sepolia is a test
/// network that may be deprecated; a mainnet deployment would carry stronger
/// longevity expectations).
contract PixelTurf {
    // ---------------------------------------------------------------------
    // Constants (documented canvas geometry)
    // ---------------------------------------------------------------------

    /// @notice Canvas width in pixels.
    uint32 public constant WIDTH = 100;

    /// @notice Canvas height in pixels.
    uint32 public constant HEIGHT = 100;

    /// @notice Per-player placement cooldown, in seconds.
    uint256 public constant COOLDOWN = 60;

    /// @dev Maximum valid RGB color value (0xRRGGBB).
    uint32 private constant MAX_COLOR = 0xFFFFFF;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @dev Packed tile index (y * WIDTH + x) => color (0xRRGGBB).
    ///      0 means "never painted" (canvas background).
    mapping(uint32 => uint32) private _tiles;

    /// @notice Timestamp of each player's most recent placement (0 = never).
    /// @dev Keyed by `msg.sender` at placement time — a player cannot write
    ///      another player's cooldown entry.
    mapping(address => uint256) public lastPlacement;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted on every successful placement. Contains everything
    ///         needed to reconstruct the canvas off-chain: position, color,
    ///         player and timestamp.
    event PixelPlaced(
        uint32 indexed x, uint32 indexed y, address indexed player, uint32 color, uint256 timestamp
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidX(uint32 x);
    error InvalidY(uint32 y);
    error InvalidColor(uint32 color);
    error CooldownActive(uint256 nextAllowedAt);

    // ---------------------------------------------------------------------
    // Placement (the ONLY function that writes tile state)
    // ---------------------------------------------------------------------

    /// @notice Place a colored pixel at (x, y) as `msg.sender`.
    /// @param x     Column, must be < WIDTH.
    /// @param y     Row, must be < HEIGHT.
    /// @param color RGB color, 0xRRGGBB (0x000000 paints pure black; it does
    ///              not "erase" — every placement is a write by that player).
    function placePixel(uint32 x, uint32 y, uint32 color) external {
        if (x >= WIDTH) revert InvalidX(x);
        if (y >= HEIGHT) revert InvalidY(y);
        if (color > MAX_COLOR) revert InvalidColor(color);

        uint256 last = lastPlacement[msg.sender];
        // Initial placement (last == 0) is always allowed immediately.
        if (last != 0 && block.timestamp - last < COOLDOWN) {
            revert CooldownActive(last + COOLDOWN);
        }

        // x < 100 and y < 100, so this multiplication cannot overflow.
        _tiles[y * WIDTH + x] = color;
        lastPlacement[msg.sender] = block.timestamp;

        emit PixelPlaced(x, y, msg.sender, color, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Color of tile (x, y). Reverts on out-of-bounds reads.
    function tileColor(uint32 x, uint32 y) public view returns (uint32) {
        if (x >= WIDTH) revert InvalidX(x);
        if (y >= HEIGHT) revert InvalidY(y);
        return _tiles[y * WIDTH + x];
    }

    /// @notice Color at a packed index (y * WIDTH + x). Reverts if out of range.
    function tileAt(uint32 index) external view returns (uint32) {
        if (index >= uint32(WIDTH) * uint32(HEIGHT)) revert InvalidX(index);
        return _tiles[index];
    }

    /// @notice Timestamp at which `player` may place their next pixel.
    ///         Returns 0 when the player has never placed (allowed immediately).
    function nextPlacementAllowed(address player) external view returns (uint256) {
        uint256 last = lastPlacement[player];
        if (last == 0) return 0;
        return last + COOLDOWN;
    }

    /// @notice Whether `player` can place a pixel right now.
    function canPlace(address player) external view returns (bool) {
        uint256 last = lastPlacement[player];
        return last == 0 || block.timestamp - last >= COOLDOWN;
    }
}
