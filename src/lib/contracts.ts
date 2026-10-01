export const sneakerMintAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "traitsOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
      { name: "proofHash", type: "bytes32" },
    ],
  },
  // Collectible / playable split
  { type: "function", name: "isPlayable", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "isCollectible", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "kindOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "isFingerprintUsed", stateMutability: "view", inputs: [{ name: "designHash", type: "bytes32" }, { name: "styleKey", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "usedDesigns", stateMutability: "view", inputs: [{ name: "designHash", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "usedStyles", stateMutability: "view", inputs: [{ name: "styleKey", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "setKind", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "kind", type: "uint8" }], outputs: [] },
  { type: "function", name: "setKindBatch", stateMutability: "nonpayable", inputs: [{ name: "tokenIds", type: "uint256[]" }, { name: "kind", type: "uint8" }], outputs: [] },
  {
    type: "function",
    name: "mintCollectible",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "uri", type: "string" },
      { name: "proofHash", type: "bytes32" },
      { name: "designHash", type: "bytes32" },
      { name: "styleKey", type: "bytes32" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintAuthorized",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "uri", type: "string" },
      { name: "proofHash", type: "bytes32" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintCollectibleWithProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uri", type: "string" },
      { name: "proofHash", type: "bytes32" },
      { name: "designHash", type: "bytes32" },
      { name: "styleKey", type: "bytes32" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "publicMintEnabled",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const stakingAbi = [
  { type: "function", name: "depositPOL", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "withdrawPOL", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimPOLRewards", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "stake", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "unstake", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "polPositions", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "principal", type: "uint256" }, { name: "accruedRewards", type: "uint256" }, { name: "depositedAt", type: "uint256" }, { name: "lastAccrualAt", type: "uint256" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "lockedCount", type: "uint256" }, { name: "weightBps", type: "uint256" }, { name: "tierBonusBps", type: "uint256" }, { name: "accruedRewards", type: "uint256" }, { name: "lastAccrualAt", type: "uint256" }] },
  { type: "function", name: "pendingPOLRewards", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "effectiveApyBps", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "availablePOLRewards", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "stakedTokenIds", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256[]" }] },
  { type: "function", name: "minLockSeconds", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "baseApyBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "maxApyBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "tierBonuses", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint64[4]" }] },
  { type: "function", name: "stakedOwner", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  // Daily tab challenge boost (time-boxed, inside the maxApyBps clamp)
  { type: "function", name: "tabBoostBps", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "tabBoostExpiresAt", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint64" }] },
] as const;

export const sneakerAppraiserAbi = [
  {
    type: "function",
    name: "appraise",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "estimatedValue", type: "uint256" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "appraiseRaw",
    stateMutability: "view",
    inputs: [{ name: "rarity", type: "uint8" }, { name: "tier", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tierLabel",
    stateMutability: "pure",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "tierBoostBps",
    stateMutability: "pure",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "tierValueList",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[4]" }],
  },
  {
    type: "function",
    name: "baseValue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "rarityWeight",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "appraiseCollectibleRaw",
    stateMutability: "view",
    inputs: [{ name: "rarity", type: "uint8" }, { name: "tier", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "collectibleParams",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "baseValue_", type: "uint256" },
      { name: "tierValues_", type: "uint256[4]" },
      { name: "rarityWeight_", type: "uint256" },
      { name: "multiplierBps_", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "updateCollectibleParams",
    stateMutability: "nonpayable",
    inputs: [
      { name: "baseValue_", type: "uint256" },
      { name: "tierValues_", type: "uint256[4]" },
      { name: "rarityWeight_", type: "uint256" },
      { name: "multiplierBps_", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "globalMultiplierBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const erc721BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const erc721ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const sneakerMarketplaceAbi = [
  // Listings — collection-aware: every sale entity carries the NFT contract.
  { type: "function", name: "list", stateMutability: "nonpayable", inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "price", type: "uint256" }], outputs: [] },
  { type: "function", name: "listAtAppraisal", stateMutability: "nonpayable", inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [{ name: "listingId", type: "uint256" }] },
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelListing", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "listings", stateMutability: "view", inputs: [{ name: "listingId", type: "uint256" }], outputs: [{ name: "seller", type: "address" }, { name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "price", type: "uint256" }, { name: "listedAt", type: "uint64" }, { name: "active", type: "bool" }] },
  // Auctions
  { type: "function", name: "createAuction", stateMutability: "nonpayable", inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "startPrice", type: "uint256" }, { name: "duration", type: "uint64" }], outputs: [] },
  { type: "function", name: "bid", stateMutability: "payable", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "settleAuction", stateMutability: "nonpayable", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelAuction", stateMutability: "nonpayable", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "auctions", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "seller", type: "address" }, { name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "startPrice", type: "uint256" }, { name: "highestBidder", type: "address" }, { name: "highestBid", type: "uint256" }, { name: "endTime", type: "uint64" }, { name: "active", type: "bool" }, { name: "settled", type: "bool" }] },
  // Offers
  { type: "function", name: "makeOffer", stateMutability: "payable", inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "duration", type: "uint64" }], outputs: [] },
  { type: "function", name: "acceptOffer", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelOffer", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "offers", stateMutability: "view", inputs: [{ name: "offerId", type: "uint256" }], outputs: [{ name: "buyer", type: "address" }, { name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "expiresAt", type: "uint64" }, { name: "active", type: "bool" }] },
  // State
  { type: "function", name: "tokenSaleKind", stateMutability: "view", inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "allowedCollections", stateMutability: "view", inputs: [{ name: "collection", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "accumulatedFees", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "tradesCount", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  // Views
  { type: "function", name: "suggestedPrice", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "valueRecommendations", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "string[]" }] },
] as const;

export const sneakerGameAbi = [
  // Gameplay
  { type: "function", name: "activate", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimPoints", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "repair", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "redeem", stateMutability: "nonpayable", inputs: [{ name: "points", type: "uint256" }], outputs: [] },
  // State
  { type: "function", name: "sneakers", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "lastActivationAt", type: "uint64" }, { name: "lastAccrualAt", type: "uint64" }, { name: "streak", type: "uint32" }, { name: "durability", type: "uint16" }, { name: "pendingPoints", type: "uint256" }, { name: "lifetimePoints", type: "uint256" }, { name: "lastDecayAt", type: "uint64" }, { name: "energy", type: "uint16" }] },
  { type: "function", name: "veRuneBalance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalRedeemed", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "lifetimeEarned", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  // Views
  { type: "function", name: "pendingPoints", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "earnRatePerSecond", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "powerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "healthOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "energyOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "maxEnergyOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "canActivate", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "secondsUntilActivation", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "streakMultiplierBps", stateMutability: "view", inputs: [{ name: "streak", type: "uint32" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "redemptionEnabled", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "redemptionRate", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "repairCostPoints", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "maxDurability", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "wearPerActivation", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "tierBasePointsPerDay", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export type SneakerMintAbi = typeof sneakerMintAbi;
export type StakingAbi = typeof stakingAbi;
export type SneakerAppraiserAbi = typeof sneakerAppraiserAbi;
export type SneakerMarketplaceAbi = typeof sneakerMarketplaceAbi;
export type SneakerGameAbi = typeof sneakerGameAbi;

export const veSneakerStoreAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "designIndex", type: "uint256" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "buyBatch",
    stateMutability: "payable",
    inputs: [{ name: "designIndex", type: "uint256" }, { name: "quantity", type: "uint16" }],
    outputs: [{ name: "firstTokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "designs",
    stateMutability: "view",
    inputs: [{ name: "designIndex", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "uri", type: "string" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
      { name: "price", type: "uint256" },
      { name: "maxSupply", type: "uint16" },
      { name: "minted", type: "uint16" },
      { name: "requiredLevel", type: "uint8" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "requiredPerkPlusOne",
    stateMutability: "view",
    inputs: [{ name: "designIndex", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "setDesignRequiredPerk",
    stateMutability: "nonpayable",
    inputs: [{ name: "designIndex", type: "uint256" }, { name: "perkId", type: "uint256" }, { name: "required", type: "bool" }],
    outputs: [],
  },
  { type: "function", name: "vault", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "designCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "priceOf",
    stateMutability: "view",
    inputs: [{ name: "designIndex", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "remaining",
    stateMutability: "view",
    inputs: [{ name: "designIndex", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isAvailable",
    stateMutability: "view",
    inputs: [{ name: "designIndex", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [{ name: "designIndex", type: "uint256" }, { name: "quantity", type: "uint16" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export type VeSneakerStoreAbi = typeof veSneakerStoreAbi;

// ─────────────────────────── Upgrade economy (v1.0) ──────────────────────────

export const sneakerModsAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "traitsOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "slot", type: "uint8" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
      { name: "effectBps", type: "uint16" },
      { name: "aux", type: "uint8" },
      { name: "consumable", type: "bool" },
      { name: "proofHash", type: "bytes32" },
    ],
  },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "totalMinted", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "achievementCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "achievements",
    stateMutability: "view",
    inputs: [{ name: "achievementId", type: "uint256" }],
    outputs: [
      { name: "kind", type: "uint8" },
      { name: "threshold", type: "uint256" },
      { name: "slot", type: "uint8" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
      { name: "effectBps", type: "uint16" },
      { name: "aux", type: "uint8" },
      { name: "consumable", type: "bool" },
      { name: "uri", type: "string" },
      { name: "active", type: "bool" },
    ],
  },
  { type: "function", name: "meetsRequirement", stateMutability: "view", inputs: [{ name: "achievementId", type: "uint256" }, { name: "user", type: "address" }, { name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "achievementClaimed", stateMutability: "view", inputs: [{ name: "achievementId", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "achievementId", type: "uint256" }, { name: "sneakerId", type: "uint256" }], outputs: [{ name: "tokenId", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ name: "", type: "bool" }] },
] as const;

export const sneakerWorkshopAbi = [
  // Equipment
  { type: "function", name: "equip", stateMutability: "nonpayable", inputs: [{ name: "sneakerId", type: "uint256" }, { name: "modId", type: "uint256" }], outputs: [] },
  { type: "function", name: "unequip", stateMutability: "nonpayable", inputs: [{ name: "sneakerId", type: "uint256" }, { name: "slot", type: "uint8" }], outputs: [] },
  { type: "function", name: "useRepairKit", stateMutability: "nonpayable", inputs: [{ name: "sneakerId", type: "uint256" }, { name: "modId", type: "uint256" }], outputs: [] },
  { type: "function", name: "useAbility", stateMutability: "nonpayable", inputs: [{ name: "sneakerId", type: "uint256" }, { name: "modId", type: "uint256" }], outputs: [] },
  // Equipped state
  { type: "function", name: "equipped", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }, { name: "slot", type: "uint8" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "equippedTo", stateMutability: "view", inputs: [{ name: "modId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "equippedCount", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "custodian", stateMutability: "view", inputs: [{ name: "modId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "hasEquippedMods", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  // Effective bonuses (ISneakerBoosts)
  { type: "function", name: "earnBonusBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "wearReductionBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "maxDurabilityBonusBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "repairDiscountBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "appraisalBonusBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "stakingBoostBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "skillBonusBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "actionsCount", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "autoActive", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "skinOverride", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint8" }] },
  // Consumable abilities
  { type: "function", name: "tempBoostBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "boostExpiresAt", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint64" }] },
  // Condition / 365-day season
  { type: "function", name: "conditionBps", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "lastServiceAt", stateMutability: "view", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "service", stateMutability: "nonpayable", inputs: [{ name: "sneakerId", type: "uint256" }], outputs: [] },
] as const;

export const sneakerSwapAbi = [
  { type: "function", name: "createSwap", stateMutability: "payable", inputs: [{ name: "taker", type: "address" }, { name: "offerCollection", type: "address" }, { name: "offerTokenId", type: "uint256" }, { name: "wantCollection", type: "address" }, { name: "wantTokenId", type: "uint256" }, { name: "duration", type: "uint64" }], outputs: [{ name: "swapId", type: "uint256" }] },
  { type: "function", name: "accept", stateMutability: "nonpayable", inputs: [{ name: "swapId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "swapId", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "swaps",
    stateMutability: "view",
    inputs: [{ name: "swapId", type: "uint256" }],
    outputs: [
      { name: "maker", type: "address" },
      { name: "taker", type: "address" },
      { name: "offerCollection", type: "address" },
      { name: "offerTokenId", type: "uint256" },
      { name: "wantCollection", type: "address" },
      { name: "wantTokenId", type: "uint256" },
      { name: "polTopUp", type: "uint256" },
      { name: "expiresAt", type: "uint64" },
      { name: "active", type: "bool" },
    ],
  },
  { type: "function", name: "allowedCollections", stateMutability: "view", inputs: [{ name: "collection", type: "address" }], outputs: [{ name: "", type: "bool" }] },
] as const;

export const modRentalAbi = [
  { type: "function", name: "list", stateMutability: "nonpayable", inputs: [{ name: "modId", type: "uint256" }, { name: "pricePerDay", type: "uint256" }, { name: "maxDuration", type: "uint64" }], outputs: [] },
  { type: "function", name: "cancelListing", stateMutability: "nonpayable", inputs: [{ name: "rentalId", type: "uint256" }], outputs: [] },
  { type: "function", name: "rent", stateMutability: "payable", inputs: [{ name: "rentalId", type: "uint256" }, { name: "days_", type: "uint64" }], outputs: [] },
  { type: "function", name: "extend", stateMutability: "payable", inputs: [{ name: "rentalId", type: "uint256" }, { name: "extraDays", type: "uint64" }], outputs: [] },
  { type: "function", name: "equipRented", stateMutability: "nonpayable", inputs: [{ name: "rentalId", type: "uint256" }, { name: "sneakerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "releaseEarly", stateMutability: "nonpayable", inputs: [{ name: "rentalId", type: "uint256" }], outputs: [] },
  { type: "function", name: "returnExpired", stateMutability: "nonpayable", inputs: [{ name: "rentalId", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "rentals",
    stateMutability: "view",
    inputs: [{ name: "rentalId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "modId", type: "uint256" },
      { name: "pricePerDay", type: "uint256" },
      { name: "maxDuration", type: "uint64" },
      { name: "renter", type: "address" },
      { name: "rentedUntil", type: "uint64" },
      { name: "listed", type: "bool" },
    ],
  },
  { type: "function", name: "rentalOf", stateMutability: "view", inputs: [{ name: "modId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isActiveRental", stateMutability: "view", inputs: [{ name: "modId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "activeRenter", stateMutability: "view", inputs: [{ name: "modId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

export const modStoreAbi = [
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ name: "designIndex", type: "uint256" }], outputs: [{ name: "tokenId", type: "uint256" }] },
  { type: "function", name: "buyBatch", stateMutability: "payable", inputs: [{ name: "designIndex", type: "uint256" }, { name: "quantity", type: "uint16" }], outputs: [{ name: "firstTokenId", type: "uint256" }] },
  {
    type: "function",
    name: "designs",
    stateMutability: "view",
    inputs: [{ name: "designIndex", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "uri", type: "string" },
      { name: "slot", type: "uint8" },
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
      { name: "effectBps", type: "uint16" },
      { name: "aux", type: "uint8" },
      { name: "consumable", type: "bool" },
      { name: "price", type: "uint256" },
      { name: "maxSupply", type: "uint16" },
      { name: "minted", type: "uint16" },
      { name: "requiredLevel", type: "uint8" },
      { name: "active", type: "bool" },
    ],
  },
  { type: "function", name: "requiredPerkPlusOne", stateMutability: "view", inputs: [{ name: "designIndex", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "setDesignRequiredPerk", stateMutability: "nonpayable", inputs: [{ name: "designIndex", type: "uint256" }, { name: "perkId", type: "uint256" }, { name: "required", type: "bool" }], outputs: [] },
  { type: "function", name: "vault", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "designCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "remaining", stateMutability: "view", inputs: [{ name: "designIndex", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isAvailable", stateMutability: "view", inputs: [{ name: "designIndex", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "designIndex", type: "uint256" }, { name: "quantity", type: "uint16" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export type SneakerModsAbi = typeof sneakerModsAbi;
export type SneakerWorkshopAbi = typeof sneakerWorkshopAbi;
export type SneakerSwapAbi = typeof sneakerSwapAbi;
export type ModRentalAbi = typeof modRentalAbi;
export type ModStoreAbi = typeof modStoreAbi;

export const playerProgressAbi = [
  // Profile (public identity — uploaded images stay off-chain)
  { type: "function", name: "setUsername", stateMutability: "nonpayable", inputs: [{ name: "username", type: "string" }], outputs: [] },
  { type: "function", name: "setNftAvatar", stateMutability: "nonpayable", inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "usernames", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "avatarCollection", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "avatarTokenId", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  // XP / levels
  { type: "function", name: "xpOf", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "xpBreakdown", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "sneakerXp", type: "uint256" }, { name: "modXp", type: "uint256" }, { name: "veRuneXp", type: "uint256" }, { name: "tradeXp", type: "uint256" }, { name: "workshopXp", type: "uint256" }, { name: "stakingXp", type: "uint256" }] },
  { type: "function", name: "levelOf", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "progressOf", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "xp", type: "uint256" }, { name: "level", type: "uint8" }, { name: "currentLevelXp", type: "uint256" }, { name: "nextLevelXp", type: "uint256" }] },
  { type: "function", name: "levelThresholds", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "thresholds", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256[]" }] },
  { type: "function", name: "MAX_LEVEL", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

export type PlayerProgressAbi = typeof playerProgressAbi;

export const sneakerVaultAbi = [
  { type: "function", name: "perkCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "bestDiscountBps", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint16" }] },
  { type: "function", name: "isEligible", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "perkId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "accessClaimed", stateMutability: "view", inputs: [{ name: "perkId", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "claimPerk", stateMutability: "nonpayable", inputs: [{ name: "perkId", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "perks",
    stateMutability: "view",
    inputs: [{ name: "perkId", type: "uint256" }],
    outputs: [
      { name: "kind", type: "uint8" },
      { name: "valueBps", type: "uint16" },
      { name: "minTier", type: "uint8" },
      { name: "requiredLevel", type: "uint8" },
      { name: "minPolStaked", type: "uint256" },
      { name: "minConditionBps", type: "uint16" },
      { name: "minModCount", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
] as const;

export const feeSplitterAbi = [
  { type: "function", name: "pendingFees", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalDistributed", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "recipientCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "recipientAt", stateMutability: "view", inputs: [{ name: "index", type: "uint256" }], outputs: [{ name: "account", type: "address" }, { name: "weightBps", type: "uint256" }] },
  {
    type: "function",
    name: "recipients",
    stateMutability: "view",
    inputs: [],
    outputs: [{
      name: "",
      type: "tuple[]",
      components: [
        { name: "account", type: "address" },
        { name: "weightBps", type: "uint256" },
      ],
    }],
  },
  { type: "function", name: "distribute", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export type SneakerVaultAbi = typeof sneakerVaultAbi;
export type FeeSplitterAbi = typeof feeSplitterAbi;
