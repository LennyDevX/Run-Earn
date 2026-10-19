import assert from "node:assert";
import { describe, it } from "mocha";
import { getAddress } from "viem";
import { batchCallsWith, inAppProvider, type InAppAccount } from "../src/lib/in-app-wallet.js";

/// The EIP-1193 adapter is the whole cost of adding a wallet type, and it is the
/// piece most likely to be silently wrong: a mis-shaped param reaches the wallet
/// SDK as `undefined` and the failure surfaces far from here. It is a pure
/// function of the account, so it can be exercised without a thirdweb client ID.
///
/// What this cannot cover is the connect flow itself — that needs a real client
/// ID and a real inbox.
const ADDRESS = "0x581A41c663223bAE563134C67151CdC2C274f06A";
const CHAIN_ID = 137;

type Recorded = {
  sent: Array<{ to?: string; value?: bigint; data?: string; chainId: number }>;
  messages: Array<{ raw: string }>;
  typed: unknown[];
};

function mockAccount() {
  const recorded: Recorded = { sent: [], messages: [], typed: [] };
  const account: InAppAccount = {
    address: ADDRESS,
    async sendTransaction(tx) {
      recorded.sent.push(tx);
      return { transactionHash: "0xabc123" };
    },
    async signMessage({ message }) {
      recorded.messages.push(message);
      return "0xsignedmessage";
    },
    async signTypedData(typedData) {
      recorded.typed.push(typedData);
      return "0xsignedtyped";
    },
  };
  return { account, recorded };
}

describe("In-app wallet EIP-1193 adapter", () => {
  it("answers eth_accounts with the checksummed address", async () => {
    const { account } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    assert.deepEqual(await provider.request({ method: "eth_accounts" }), [getAddress(ADDRESS)]);
  });

  it("answers eth_requestAccounts with the same address", async () => {
    const { account } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    assert.deepEqual(await provider.request({ method: "eth_requestAccounts" }), [getAddress(ADDRESS)]);
  });

  it("reports the configured chain as hex", async () => {
    const { account } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    assert.equal(await provider.request({ method: "eth_chainId" }), "0x89");
  });

  it("forwards eth_sendTransaction and returns the hash", async () => {
    const { account, recorded } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    const hash = await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: ADDRESS, to: ADDRESS, value: "0xde0b6b3a7640000", data: "0xdeadbeef" }],
    });

    assert.equal(hash, "0xabc123");
    assert.equal(recorded.sent.length, 1);
    // The hex value must become a bigint: thirdweb expects wei, not a hex string.
    assert.equal(recorded.sent[0].value, 1_000_000_000_000_000_000n);
    assert.equal(recorded.sent[0].to, ADDRESS);
    assert.equal(recorded.sent[0].data, "0xdeadbeef");
    assert.equal(recorded.sent[0].chainId, CHAIN_ID);
  });

  it("omits value and data when the caller did not send them", async () => {
    const { account, recorded } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    await provider.request({ method: "eth_sendTransaction", params: [{ from: ADDRESS, to: ADDRESS }] });

    assert.equal(recorded.sent[0].value, undefined);
    assert.equal(recorded.sent[0].data, undefined);
  });

  it("wraps personal_sign as a raw message", async () => {
    const { account, recorded } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    const signature = await provider.request({ method: "personal_sign", params: ["0x68656c6c6f", ADDRESS] });

    assert.equal(signature, "0xsignedmessage");
    assert.deepEqual(recorded.messages, [{ raw: "0x68656c6c6f" }]);
  });

  it("parses eth_signTypedData_v4 before handing it to the wallet", async () => {
    const { account, recorded } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    const payload = { domain: { name: "Airen" }, types: {}, primaryType: "Thing", message: {} };
    const signature = await provider.request({
      method: "eth_signTypedData_v4",
      params: [ADDRESS, JSON.stringify(payload)],
    });

    assert.equal(signature, "0xsignedtyped");
    assert.deepEqual(recorded.typed, [payload]);
  });

  it("resolves chain-switch calls instead of throwing", async () => {
    const { account } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    // The connect path calls this. Rejecting would make a working wallet look
    // broken, so it resolves to null.
    assert.equal(await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] }), null);
    assert.equal(await provider.request({ method: "wallet_addEthereumChain", params: [{}] }), null);
  });

  it("rejects a method it does not implement", async () => {
    const { account } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    await assert.rejects(provider.request({ method: "eth_getBalance", params: [ADDRESS, "latest"] }));
  });

  it("registers and removes listeners", () => {
    const { account } = mockAccount();
    const provider = inAppProvider(account, CHAIN_ID);
    const handler = () => undefined;

    // No assertion on emission: an in-app wallet is pinned to one chain and has
    // no account changes to announce. What matters is that the app's
    // attachProvider/cleanup cycle does not throw.
    provider.on("accountsChanged", handler);
    provider.removeListener("accountsChanged", handler);
    provider.removeListener("never-registered", handler);
  });
});

/// Batching is the reason the in-app wallet is worth having beyond onboarding:
/// `approve` + `equip` and `approve` + `list` are two signature prompts on a
/// plain wallet and one on an EIP-7702 smart account. The risk is silent — a
/// "batch" that actually submits N transactions would look identical to the
/// caller, so the count is asserted directly.
describe("In-app wallet batching", () => {
  const APPROVE = "0x095ea7b3";
  const EQUIP = "0x12345678";

  type SentTx = { to?: string; value?: bigint; data?: string; chainId: number };

  function mockAccount(batchable = true) {
    const batches: SentTx[][] = [];
    const account: InAppAccount = {
      address: ADDRESS,
      async sendTransaction() {
        throw new Error("the single-call path must not be used when batching is available");
      },
      async signMessage() {
        return "0x";
      },
      async signTypedData() {
        return "0x";
      },
      ...(batchable
        ? {
            async sendBatchTransaction(txs: SentTx[]) {
              batches.push(txs);
              return { transactionHash: "0xbatch" };
            },
          }
        : {}),
    };
    return { account, batches };
  }

  it("submits every call in one transaction", async () => {
    const { account, batches } = mockAccount();
    const hash = await batchCallsWith(
      account,
      [
        { to: ADDRESS, data: APPROVE },
        { to: ADDRESS, data: EQUIP },
      ],
      CHAIN_ID,
    );

    assert.equal(hash, "0xbatch");
    assert.equal(batches.length, 1, "must be ONE transaction, not one per call");
    assert.equal(batches[0].length, 2);
    assert.equal(batches[0][0].data, APPROVE);
    assert.equal(batches[0][1].data, EQUIP);
    assert.equal(batches[0][0].chainId, CHAIN_ID);
  });

  it("omits value when a call does not carry any", async () => {
    const { account, batches } = mockAccount();
    await batchCallsWith(account, [{ to: ADDRESS, data: APPROVE }], CHAIN_ID);
    assert.equal(batches[0][0].value, undefined);
  });

  it("carries value through when a call needs it", async () => {
    const { account, batches } = mockAccount();
    await batchCallsWith(account, [{ to: ADDRESS, value: 10n ** 18n }], CHAIN_ID);
    assert.equal(batches[0][0].value, 10n ** 18n);
  });

  it("refuses an account that cannot batch rather than falling back silently", async () => {
    const { account } = mockAccount(false);
    await assert.rejects(batchCallsWith(account, [{ to: ADDRESS, data: APPROVE }], CHAIN_ID));
  });

  it("refuses an empty call list", async () => {
    const { account, batches } = mockAccount();
    await assert.rejects(batchCallsWith(account, [], CHAIN_ID));
    assert.equal(batches.length, 0);
  });
});
