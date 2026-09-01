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

export type SneakerMintAbi = typeof sneakerMintAbi;
export type StakingAbi = typeof stakingAbi;
