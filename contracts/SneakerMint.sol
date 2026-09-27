// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SneakerMint — Airen sneaker NFT collection.
/// @notice Mints ERC-721 tokens from AI-generated sneaker artwork.
/// @dev Users create NFTs via the /mint route: they upload a photo of their
///      sneaker, the AI agent generates a unique retro-futuristic virtual
///      artwork, and the result is minted on-chain. Each proof hash (SHA-256 of
///      the generated artwork data URL) may be used only once to prevent
///      duplicate mints.
contract SneakerMint is ERC721, ERC721Enumerable, ERC721URIStorage, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 public constant MAX_RARITY = 100;
    uint8 public constant MAX_TIER = 4; // Common, Rare, Epic, Mythic

    struct SneakerTraits {
        uint8 rarity;
        uint8 tier;
        bytes32 proofHash;
    }

    uint256 private _nextTokenId;
    bool public publicMintEnabled;
    string public baseURI;

    mapping(bytes32 proofHash => bool used) public usedProofs;
    mapping(uint256 tokenId => SneakerTraits traits) private _traits;

    event SneakerMinted(address indexed owner, uint256 indexed tokenId, bytes32 indexed proofHash, uint8 rarity, uint8 tier);
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

    // ─────────────────────────── Mint ────────────────────────────

    /// @notice Mint authorized by the verifier backend (MINTER_ROLE).
    /// @dev This is the production path: the backend assigns rarity/tier
    ///      after validating the purchase and AI artwork off-chain.
    function mintAuthorized(
        address to,
        string calldata uri,
        bytes32 proofHash,
        uint8 rarity,
        uint8 tier
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        return _mintSneaker(to, uri, proofHash, rarity, tier);
    }

    /// @notice Self-service mint using a one-time proof hash.
    /// @dev Only available when publicMintEnabled is true. Acceptable for
    ///      Amoy testing and early beta. In production, use mintAuthorized.
    function mintWithProof(
        string calldata uri,
        bytes32 proofHash,
        uint8 rarity,
        uint8 tier
    ) external whenNotPaused returns (uint256) {
        require(publicMintEnabled, "SneakerMint: public mint disabled");
        return _mintSneaker(msg.sender, uri, proofHash, rarity, tier);
    }

    // ─────────────────────────── Views ───────────────────────────

    function traitsOf(uint256 tokenId) external view returns (SneakerTraits memory) {
        _requireOwned(tokenId);
        return _traits[tokenId];
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
        uint8 tier
    ) internal returns (uint256) {
        require(to != address(0), "SneakerMint: zero recipient");
        require(proofHash != bytes32(0), "SneakerMint: empty proof");
        require(!usedProofs[proofHash], "SneakerMint: proof used");
        require(rarity <= MAX_RARITY, "SneakerMint: invalid rarity");
        require(tier < MAX_TIER, "SneakerMint: invalid tier");

        usedProofs[proofHash] = true;
        uint256 tokenId = ++_nextTokenId;
        _traits[tokenId] = SneakerTraits({rarity: rarity, tier: tier, proofHash: proofHash});
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit SneakerMinted(to, tokenId, proofHash, rarity, tier);
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
