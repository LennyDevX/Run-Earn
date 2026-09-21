export type RarityLevel = "comun" | "raro" | "epico" | "mitico";

export const RARITIES: readonly {
  id: RarityLevel;
  label: string;
  multiplier: string;
  boostBps: bigint;
  boostLabel: string;
  accent: string;
}[] = [
  { id: "comun", label: "Common", multiplier: "×1.0", boostBps: 50n, boostLabel: "+0.5% APY", accent: "bg-foreground/10 text-foreground/60" },
  { id: "raro", label: "Rare", multiplier: "×1.5", boostBps: 80n, boostLabel: "+0.8% APY", accent: "bg-sky/15 text-sky" },
  { id: "epico", label: "Epic", multiplier: "×2.25", boostBps: 150n, boostLabel: "+1.5% APY", accent: "bg-magma/15 text-magma" },
  { id: "mitico", label: "Mythic", multiplier: "×3.4", boostBps: 180n, boostLabel: "+1.8% APY", accent: "bg-mint/15 text-mint" },
] as const;

export const PALETTES = [
  { id: "neon", label: "Neon", colors: ["#38bdf8", "#3ddc97", "#ff4a2d"] },
  { id: "violeta", label: "Violet", colors: ["#8247e5", "#c084fc", "#38bdf8"] },
  { id: "mono", label: "Mono", colors: ["#fafafa", "#d4d4d8", "#0a0a0c"] },
  { id: "magma", label: "Magma", colors: ["#ff4a2d", "#ff8a5c", "#0a0a0c"] },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];

export const DEFAULT_SNEAKER_DESCRIPTION =
  "RUN&EARN virtual sneaker (veSneaker) created by its owner. " +
  "AI-generated artwork converted into a unique digital asset on Polygon " +
  "with verifiable rarity and style on-chain — playable, upgradeable, and tradable.";

export type MintedSneaker = {
  id: string;
  name: string;
  description: string;
  rarity: RarityLevel;
  palette: PaletteId;
  imageDataUrl: string;
  owner: string;
  mintedAt: number;
  transactionHash?: string;
  tokenId?: string;
};

const STORAGE_PREFIX = "runearn:my-nfts:";

export function getMintedSneakers(owner: string | null): MintedSneaker[] {
  if (typeof window === "undefined") return [];
  try {
    const key = `${STORAGE_PREFIX}${owner?.toLowerCase() ?? "guest"}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MintedSneaker[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMintedSneaker(owner: string, sneaker: MintedSneaker) {
  const key = `${STORAGE_PREFIX}${owner.toLowerCase()}`;
  const existing = getMintedSneakers(owner);
  window.localStorage.setItem(key, JSON.stringify([sneaker, ...existing]));
}

export function buildTokenMetadata(sneaker: Omit<MintedSneaker, "id" | "owner" | "mintedAt">) {
  const rarity = RARITIES.find((item) => item.id === sneaker.rarity);
  const palette = PALETTES.find((item) => item.id === sneaker.palette);
  return {
    name: sneaker.name,
    description: sneaker.description,
    image: sneaker.imageDataUrl,
    attributes: [
      { trait_type: "Rarity", value: rarity?.label ?? sneaker.rarity },
      { trait_type: "Multiplier", value: rarity?.multiplier ?? "×1.0" },
      { trait_type: "Palette", value: palette?.label ?? sneaker.palette },
      { trait_type: "Origin", value: "User sneaker · AI generated" },
      { trait_type: "Network", value: "Polygon" },
    ],
  };
}

export function buildTokenUri(sneaker: Omit<MintedSneaker, "id" | "owner" | "mintedAt">) {
  return `data:application/json;base64,${btoa(JSON.stringify(buildTokenMetadata(sneaker)))}`;
}
