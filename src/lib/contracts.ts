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
    name: "traitsOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "rarity", type: "uint8" },
      { name: "tier", type: "uint8" },
      { name: "proofHash", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "mintWithProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "uri", type: "string" },
      { name: "proofHash", type: "bytes32" },
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
  // Listings
  { type: "function", name: "list", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "price", type: "uint256" }], outputs: [] },
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelListing", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "listings", stateMutability: "view", inputs: [{ name: "listingId", type: "uint256" }], outputs: [{ name: "seller", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "price", type: "uint256" }, { name: "listedAt", type: "uint64" }, { name: "active", type: "bool" }] },
  // Auctions
  { type: "function", name: "createAuction", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "startPrice", type: "uint256" }, { name: "duration", type: "uint64" }], outputs: [] },
  { type: "function", name: "bid", stateMutability: "payable", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "settleAuction", stateMutability: "nonpayable", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelAuction", stateMutability: "nonpayable", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "auctions", stateMutability: "view", inputs: [{ name: "auctionId", type: "uint256" }], outputs: [{ name: "seller", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "startPrice", type: "uint256" }, { name: "highestBidder", type: "address" }, { name: "highestBid", type: "uint256" }, { name: "endTime", type: "uint64" }, { name: "active", type: "bool" }, { name: "settled", type: "bool" }] },
  // Offers
  { type: "function", name: "makeOffer", stateMutability: "payable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "duration", type: "uint64" }], outputs: [] },
  { type: "function", name: "acceptOffer", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancelOffer", stateMutability: "nonpayable", inputs: [{ name: "offerId", type: "uint256" }], outputs: [] },
  { type: "function", name: "offers", stateMutability: "view", inputs: [{ name: "offerId", type: "uint256" }], outputs: [{ name: "buyer", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "expiresAt", type: "uint64" }, { name: "active", type: "bool" }] },
  // State
  { type: "function", name: "tokenSaleKind", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "accumulatedFees", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
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
  { type: "function", name: "sneakers", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "lastActivationAt", type: "uint64" }, { name: "lastAccrualAt", type: "uint64" }, { name: "streak", type: "uint32" }, { name: "durability", type: "uint16" }, { name: "pendingPoints", type: "uint256" }, { name: "lifetimePoints", type: "uint256" }] },
  { type: "function", name: "veRuneBalance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalRedeemed", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  // Views
  { type: "function", name: "pendingPoints", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "earnRatePerSecond", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
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
      { name: "active", type: "bool" },
    ],
  },
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
