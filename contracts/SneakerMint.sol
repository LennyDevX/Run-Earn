// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SneakerMint — Airen sneaker NFT collection.
/// @notice Mints ERC-721 tokens from AI-generated sneaker artwork.
///
/// ### Two kinds of token, one collection
///
/// | Kind | Source | Usable in |
/// | ---- | ------ | --------- |
/// | **Playable** | `VeSneakerStore` — the official Airen collection | Staking, tab arena, game, workshop, marketplace |
/// | **Collectible** | The AI mint studio (`/mint`) | Marketplace only — pure digital art |
///
/// A collectible is a unique piece of AI artwork reconstructed from the owner's
/// physical sneaker. It is deliberately **not** a veSneaker: it cannot be staked,
/// cannot run the daily tab challenge, cannot be equipped, and does not mine
/// veRUNE. The only gameplay surface it touches is the marketplace, where it
/// trades at a price the appraiser sets.
///
/// The kind lives in its own mapping rather than inside `SneakerTraits` on
/// purpose: adding a fourth struct field would break every positional
/// `traitsOf` destructure across the protocol and the test suite. A dedicated
/// mapping costs one extra read at the gate and changes nothing else.
///
/// ### Three uniqueness guarantees
///
/// The studio is off-chain, so the server computes the fingerprints; the
/// contract is what makes them non-bypassable:
///
/// 1. `usedProofs[proofHash]` — SHA-256 of the artwork. Blocks re-minting the
///    exact same image.
/// 2. `usedDesigns[designHash]` — semantic fingerprint of the sneaker
///    (model, silhouette, dominant colorway). Blocks the same physical pair
///    being minted twice from two different photos.
/// 3. `usedStyles[styleKey]` — the style combination used for the render
///    (palette band, accent, composition). Blocks two collectors receiving the
///    same look, which is what keeps the collection visually exclusive.
contract SneakerMint is ERC721, ERC721Enumerable, ERC721URIStorage, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 public constant MAX_RARITY = 100;
    uint8 public constant MAX_TIER = 4; // Common, Rare, Epic, Mythic

    /// @notice What a token is allowed to do.
    enum SneakerKind {
        Playable, // official veSneaker — staking, tab arena, game, workshop
        Collectible // AI art mint — marketplace only
    }

    struct SneakerTraits {
        uint8 rarity;
        uint8 tier;
        bytes32 proofHash;
    }

    uint256 private _nextTokenId;
    bool public publicMintEnabled;
    string public baseURI;

    /// @notice tokenId => kind. Defaults to Playable for ids minted before the
    ///      kind split; `setKindBatch` migrates those to Collectible.
    mapping(uint256 tokenId => SneakerKind kind) public kindOf;

    /// @notice Artwork hashes already minted (exact re-mint guard).
    mapping(bytes32 proofHash => bool used) public usedProofs;
    /// @notice Semantic design fingerprints already minted (same-pair guard).
    mapping(bytes32 designHash => bool used) public usedDesigns;
    /// @notice Style combinations already handed out (exclusivity guard).
    mapping(bytes32 styleKey => bool used) public usedStyles;

    mapping(uint256 tokenId => SneakerTraits traits) private _traits;

    event SneakerMinted(address indexed owner, uint256 indexed tokenId, bytes32 indexed proofHash, uint8 rarity, uint8 tier);
    event CollectibleMinted(
        address indexed owner,
        uint256 indexed tokenId,
        bytes32 indexed designHash,
        bytes32 styleKey,
        uint8 rarity,
        uint8 tier
    );
    event KindUpdated(uint256 indexed tokenId, SneakerKind kind);
    event BaseURISet(string newBaseURI);
    event PublicMintToggled(bool enabled);

    constructor(
        string memory name_,
        string memory symbol_,
        address admin
    ) ERC721(name_, symbol_) {
        require(admin != address(0), "SneakerMint: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setPublicMintEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        publicMintEnabled = enabled;
        emit PublicMintToggled(enabled);
    }

    function setBaseURI(string calldata newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseURI = newBaseURI;
        emit BaseURISet(newBaseURI);
    }

    /// @notice Reclassify a token. Admin only.
    /// @dev Used for the one-time migration that marks tokens minted before the
    ///      kind split as Collectible. It is also the recovery path if a store
    ///      deployment needs a token whitelisted back to Playable.
    function setKind(uint256 tokenId, SneakerKind kind) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireOwned(tokenId);
        kindOf[tokenId] = kind;
        emit KindUpdated(tokenId, kind);
    }

    /// @notice Batch reclassify. Admin only — cheaper than N single calls.
    function setKindBatch(uint256[] calldata tokenIds, SneakerKind kind) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i; i < tokenIds.length; ++i) {
            _requireOwned(tokenIds[i]);
            kindOf[tokenIds[i]] = kind;
            emit KindUpdated(tokenIds[i], kind);
        }
    }

    // ─────────────────────────── Mint ────────────────────────────

    /// @notice Mint a **Playable** veSneaker. Reserved for the official store.
    /// @dev This is the only path that produces a token usable in staking, the
    ///      tab arena, the game, and the workshop.
    function mintAuthorized(
        address to,
        string calldata uri,
        bytes32 proofHash,
        uint8 rarity,
        uint8 tier
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        return _mintSneaker(to, uri, proofHash, rarity, tier, SneakerKind.Playable);
    }

    /// @notice Mint a **Collectible** with full uniqueness proofs. Production
    ///      path: the backend computes the fingerprints after validating the
    ///      artwork off-chain.
    /// @param proofHash SHA-256 of the artwork data URL (exact re-mint guard).
    /// @param designHash Semantic fingerprint of the sneaker (same-pair guard).
    /// @param styleKey Style combination handed out for this render (exclusivity guard).
    function mintCollectible(
        address to,
        string calldata uri,
        bytes32 proofHash,
        bytes32 designHash,
        bytes32 styleKey,
        uint8 rarity,
        uint8 tier
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        return _mintCollectible(to, uri, proofHash, designHash, styleKey, rarity, tier);
    }

    /// @notice Self-service collectible mint with one-time proofs.
    /// @dev Only available when `publicMintEnabled` is true. Acceptable for Amoy
    ///      testing and early beta; in production prefer `mintCollectible`, so
    ///      the backend — not the caller — computes the fingerprints.
    function mintCollectibleWithProof(
        string calldata uri,
        bytes32 proofHash,
        bytes32 designHash,
        bytes32 styleKey,
        uint8 rarity,
        uint8 tier
    ) external whenNotPaused returns (uint256) {
        require(publicMintEnabled, "SneakerMint: public mint disabled");
        return _mintCollectible(msg.sender, uri, proofHash, designHash, styleKey, rarity, tier);
    }

    // ─────────────────────────── Views ───────────────────────────

    function traitsOf(uint256 tokenId) external view returns (SneakerTraits memory) {
        _requireOwned(tokenId);
        return _traits[tokenId];
    }

    /// @notice Whether a token may be staked, played, and equipped.
    function isPlayable(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return kindOf[tokenId] == SneakerKind.Playable;
    }

    /// @notice Whether a token is AI artwork, restricted to the marketplace.
    function isCollectible(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return kindOf[tokenId] == SneakerKind.Collectible;
    }

    /// @notice Whether a uniqueness fingerprint has already been consumed.
    function isFingerprintUsed(bytes32 designHash, bytes32 styleKey) external view returns (bool) {
        return usedDesigns[designHash] || usedStyles[styleKey];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    // ─────────────────────────── Internal ────────────────────────

    function _mintSneaker(
        address to,
        string calldata uri,
        bytes32 proofHash,
        uint8 rarity,
        uint8 tier,
        SneakerKind kind
    ) internal returns (uint256) {
        require(to != address(0), "SneakerMint: zero recipient");
        require(proofHash != bytes32(0), "SneakerMint: empty proof");
        require(!usedProofs[proofHash], "SneakerMint: proof used");
        require(rarity <= MAX_RARITY, "SneakerMint: invalid rarity");
        require(tier < MAX_TIER, "SneakerMint: invalid tier");

        usedProofs[proofHash] = true;
        uint256 tokenId = ++_nextTokenId;
        kindOf[tokenId] = kind;
        _traits[tokenId] = SneakerTraits({rarity: rarity, tier: tier, proofHash: proofHash});
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit SneakerMinted(to, tokenId, proofHash, rarity, tier);
        return tokenId;
    }

    function _mintCollectible(
        address to,
        string calldata uri,
        bytes32 proofHash,
        bytes32 designHash,
        bytes32 styleKey,
        uint8 rarity,
        uint8 tier
    ) internal returns (uint256) {
        require(designHash != bytes32(0), "SneakerMint: empty design hash");
        require(styleKey != bytes32(0), "SneakerMint: empty style key");
        require(!usedDesigns[designHash], "SneakerMint: design already minted");
        require(!usedStyles[styleKey], "SneakerMint: style already used");

        usedDesigns[designHash] = true;
        usedStyles[styleKey] = true;

        uint256 tokenId = _mintSneaker(to, uri, proofHash, rarity, tier, SneakerKind.Collectible);
        emit CollectibleMinted(to, tokenId, designHash, styleKey, rarity, tier);
        return tokenId;
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
