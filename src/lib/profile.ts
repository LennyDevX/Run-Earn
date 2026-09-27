/// Local user profile store (Phase A).
///
/// Username and avatar are stored per wallet in localStorage — they are a UX
/// convenience, not on-chain identity. Phase B introduces `PlayerProgress`,
/// where username + NFT avatar pointer migrate on-chain; uploaded images stay
/// off-chain by design (photos never leave the device).

export type AvatarKind = "none" | "upload" | "nft";

export type UserProfile = {
  username: string;
  avatarKind: AvatarKind;
  /** Compressed 256px data URL when `avatarKind === "upload"`. */
  avatarDataUrl?: string;
  /** `MintedSneaker.id` reference when `avatarKind === "nft"`. */
  avatarSneakerId?: string;
  updatedAt: number;
};

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const PROFILE_PREFIX = "airen:profile:";
export const PROFILE_UPDATED_EVENT = "airen:profile-updated";

export function defaultUsername(address: string | null) {
  return `Runner #${(address ?? "0000").slice(-4).toUpperCase()}`;
}

export function getProfile(owner: string | null): UserProfile {
  const fallback: UserProfile = {
    username: defaultUsername(owner),
    avatarKind: "none",
    updatedAt: 0,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const key = `${PROFILE_PREFIX}${owner?.toLowerCase() ?? "guest"}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      username: typeof parsed.username === "string" && parsed.username.trim()
        ? parsed.username
        : fallback.username,
      avatarKind: parsed.avatarKind === "upload" || parsed.avatarKind === "nft" ? parsed.avatarKind : "none",
      avatarDataUrl: parsed.avatarDataUrl,
      avatarSneakerId: parsed.avatarSneakerId,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return fallback;
  }
}

export function saveProfile(owner: string, profile: UserProfile) {
  const key = `${PROFILE_PREFIX}${owner.toLowerCase()}`;
  window.localStorage.setItem(key, JSON.stringify({ ...profile, updatedAt: Date.now() }));
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

export function isValidUsername(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= USERNAME_MIN && trimmed.length <= USERNAME_MAX;
}

/// Resolves the displayable avatar image for a profile.
export function resolveAvatarUrl(
  profile: UserProfile,
  nftImages: ReadonlyMap<string, string>,
): string | null {
  if (profile.avatarKind === "upload" && profile.avatarDataUrl) return profile.avatarDataUrl;
  if (profile.avatarKind === "nft" && profile.avatarSneakerId) {
    return nftImages.get(profile.avatarSneakerId) ?? null;
  }
  return null;
}

/// Compresses an uploaded image to a square 256px JPEG data URL so it fits
/// comfortably in localStorage.
export function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (cause) {
        URL.revokeObjectURL(url);
        reject(cause);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

// ─────────────────────────── Player levels (Phase A estimate) ───────────────────────────
// Mirrors the on-chain `PlayerProgress` curve planned for Phase B. The local
// estimate only uses signals readable today; the contract is the source of truth
// once deployed.

export const MAX_LEVEL = 10;
export const LEVEL_THRESHOLDS = [0, 300, 800, 1600, 2800, 4500, 7000, 10500, 15000, 21000] as const;

export const LEVEL_NAMES = [
  "Rookie",
  "Walker",
  "Jogger",
  "Runner",
  "Sprinter",
  "Athlete",
  "Pro",
  "Elite",
  "Legend",
  "Mythic",
] as const;

export function levelForXp(xp: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return Math.min(level, MAX_LEVEL);
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, current: xp, next: null as number | null, pct: 100 };
  const base = LEVEL_THRESHOLDS[level - 1];
  const next = LEVEL_THRESHOLDS[level];
  return { level, current: xp, next, pct: Math.min(100, Math.round(((xp - base) / (next - base)) * 100)) };
}
