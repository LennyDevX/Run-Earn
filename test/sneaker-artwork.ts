import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { resolveSneakerArtwork } from "../src/lib/sneaker-artwork.js";
import { VE_SNEAKER_CATALOG } from "../src/lib/ve-sneakers.js";

function tokenUri(metadata: unknown) {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
}

describe("veSneaker artwork families", () => {
  it("keeps the initial storefront families in stable design order", () => {
    assert.deepEqual(VE_SNEAKER_CATALOG.map(({ name, design }) => [name, design]), [
      ["Astra", 0],
      ["Sol", 1],
      ["Luna", 2],
    ]);
  });

  it("resolves the family from token metadata without relying on token IDs", () => {
    const artwork = resolveSneakerArtwork(tokenUri({
      name: "veSneaker — Sol",
      image: "https://assets.example/veSneakerSol.png",
      attributes: [{ trait_type: "Collection", value: "Sol" }],
    }));

    assert.equal(artwork.family, "sol");
    assert.equal(artwork.src, "/veSneakerSol.png");
  });

  it("maps legacy pixel design URIs to the new family artwork", () => {
    const artwork = resolveSneakerArtwork(tokenUri({
      name: "Legacy design",
      image: "pixel://vesneaker/5",
    }));

    assert.equal(artwork.family, "luna");
    assert.equal(artwork.src, "/veSneakerLuna.png");
  });

  it("preserves generated user artwork embedded in token metadata", () => {
    const image = "data:image/png;base64,AA==";
    const artwork = resolveSneakerArtwork(tokenUri({ name: "Runner One", image }));

    assert.equal(artwork.src, image);
    assert.equal(artwork.family, null);
    assert.equal(artwork.name, "Runner One");
  });
});
