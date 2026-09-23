"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fileToAvatarDataUrl,
  getProfile,
  isValidUsername,
  PROFILE_UPDATED_EVENT,
  resolveAvatarUrl,
  saveProfile,
  type UserProfile,
} from "@/lib/profile";
import { getMintedSneakers } from "@/lib/sneaker-nft";

/// Local profile state for a wallet address: editable username + avatar
/// (uploaded image or a minted NFT's artwork). Cross-component updates flow
/// through `PROFILE_UPDATED_EVENT`; other tabs sync via `storage`.
export function useProfile(owner: string | null) {
  const [profile, setProfile] = useState<UserProfile>(() => getProfile(owner));
  const [isReady, setIsReady] = useState(false);

  const refresh = useCallback(() => {
    setProfile(getProfile(owner));
    setIsReady(true);
  }, [owner]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const update = useCallback(
    (patch: Partial<UserProfile>) => {
      if (!owner) return;
      saveProfile(owner, { ...getProfile(owner), ...patch });
    },
    [owner],
  );

  const setUsername = useCallback(
    (username: string) => {
      if (!isValidUsername(username)) return false;
      update({ username: username.trim() });
      return true;
    },
    [update],
  );

  const setAvatarUpload = useCallback(
    async (file: File) => {
      const dataUrl = await fileToAvatarDataUrl(file);
      update({ avatarKind: "upload", avatarDataUrl: dataUrl, avatarSneakerId: undefined });
    },
    [update],
  );

  const setAvatarNft = useCallback(
    (sneakerId: string) => update({ avatarKind: "nft", avatarSneakerId: sneakerId, avatarDataUrl: undefined }),
    [update],
  );

  const clearAvatar = useCallback(
    () => update({ avatarKind: "none", avatarDataUrl: undefined, avatarSneakerId: undefined }),
    [update],
  );

  // NFT avatar images live in the local minted-sneaker store (their tokenURI
  // artwork is the same generated image). Resolve the reference to a data URL.
  const avatarUrl = useMemo(() => {
    if (profile.avatarKind === "upload") return resolveAvatarUrl(profile, new Map());
    if (profile.avatarKind === "nft" && owner) {
      const images = new Map(getMintedSneakers(owner).map((s) => [s.id, s.imageDataUrl]));
      return resolveAvatarUrl(profile, images);
    }
    return null;
  }, [profile, owner]);

  return { profile, avatarUrl, isReady, setUsername, setAvatarUpload, setAvatarNft, clearAvatar, refresh };
}
