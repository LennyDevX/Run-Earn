import {
  VE_SNEAKER_FAMILIES,
  veSneakerArtworkByDesign,
  veSneakerFamilyById,
  type VeSneakerFamilyId,
} from "./ve-sneakers";

export type ResolvedSneakerArtwork = {
  src: string;
  alt: string;
  name: string | null;
  family: VeSneakerFamilyId | null;
};

type TokenMetadata = {
  name?: unknown;
  image?: unknown;
  attributes?: unknown;
};

function decodeMetadataUri(uri: string): TokenMetadata | null {
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      const binary = atob(uri.slice("data:application/json;base64,".length));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as TokenMetadata;
    }
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length))) as TokenMetadata;
    }
    return JSON.parse(uri) as TokenMetadata;
  } catch {
    return null;
  }
}

function attributeValue(metadata: TokenMetadata, key: string) {
  if (!Array.isArray(metadata.attributes)) return undefined;
  const match = metadata.attributes.find(
    (item) => typeof item === "object" && item !== null &&
      "trait_type" in item && String((item as { trait_type: unknown }).trait_type).toLowerCase() === key.toLowerCase(),
  );
  return match && typeof match === "object" && "value" in match
    ? (match as { value: unknown }).value
    : undefined;
}

function familyFromImagePath(image: string) {
  let path = image;
  try {
    path = new URL(image).pathname;
  } catch {
    path = image;
  }
  const filename = path.split("/").at(-1)?.toLowerCase();
  return VE_SNEAKER_FAMILIES.find((family) => family.imageSrc.slice(1).toLowerCase() === filename);
}

function fromFamily(familyId: VeSneakerFamilyId, name: string | null): ResolvedSneakerArtwork {
  const family = veSneakerFamilyById(familyId) ?? VE_SNEAKER_FAMILIES[0];
  return {
    src: family.imageSrc,
    alt: `${family.name} virtual sneaker collection artwork`,
    name: name ?? family.name,
    family: family.id,
  };
}

export function resolveSneakerArtwork(tokenUri: string | null | undefined): ResolvedSneakerArtwork {
  const fallback: ResolvedSneakerArtwork = {
    src: VE_SNEAKER_FAMILIES[0].imageSrc,
    alt: "Airen virtual sneaker artwork",
    name: null,
    family: null,
  };
  if (!tokenUri) return fallback;
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(tokenUri)) {
    return { ...fallback, src: tokenUri, alt: "User-created virtual sneaker artwork" };
  }

  const metadata = decodeMetadataUri(tokenUri);
  if (!metadata) return fallback;

  const name = typeof metadata.name === "string" ? metadata.name : null;
  const collection = attributeValue(metadata, "Collection") ?? attributeValue(metadata, "Family");
  const family = typeof collection === "string" ? veSneakerFamilyById(collection) : undefined;
  if (family) return fromFamily(family.id, name);

  const image = typeof metadata.image === "string" ? metadata.image : "";
  const legacyDesign = image.match(/^pixel:\/\/vesneaker\/(\d+)$/i);
  if (legacyDesign) {
    const design = Number(legacyDesign[1]);
    const legacyFamily = veSneakerArtworkByDesign(design, true);
    return fromFamily(legacyFamily.id, name);
  }

  const familyFromPath = familyFromImagePath(image);
  if (familyFromPath) return fromFamily(familyFromPath.id, name);
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(image)) {
    return { src: image, alt: name ? `${name} artwork` : "User-created virtual sneaker artwork", name, family: null };
  }

  const designValue = attributeValue(metadata, "Design");
  if (typeof designValue === "number" && Number.isInteger(designValue)) {
    const designFamily = veSneakerArtworkByDesign(designValue, true);
    return fromFamily(designFamily.id, name);
  }
  return { ...fallback, name };
}
