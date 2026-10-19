"use client";

import { getAddress, type Hex } from "viem";

/// ─────────────────────── In-app wallet (thirdweb) ──────────────────────────
///
/// Phase 2's first piece: a visitor who has never installed a browser wallet
/// signs in with an email code and immediately holds a real Polygon address.
/// It is wired in as a third EIP-1193 provider beside MetaMask and OKX, so the
/// hooks, the transaction layer and the contracts never learn it exists.
///
/// **Gated on `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`.** thirdweb needs a client ID
/// (free and self-serve, unlike OMS which is provisioned by hand) and the SDK is
/// heavy, so without that variable the option never appears and nothing here is
/// imported.
///
/// ### Why the adapter
///
/// thirdweb's `Account` is not an EIP-1193 provider — it exposes typed methods
/// (`sendTransaction`, `signMessage`, `signTypedData`) rather than
/// `request({ method, params })`. The whole app speaks EIP-1193, so this adapter
/// is the entire cost of adding a wallet type. It is written as a pure function
/// of the account so it can be exercised without a client ID.

const CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? "";

export function inAppWalletAvailable(): boolean {
  return CLIENT_ID.length > 0;
}

/// The slice of thirdweb's `Account` the adapter needs, declared structurally so
/// the adapter stays testable without the SDK in the loop.
export type InAppAccount = {
  address: string;
  sendTransaction: (tx: {
    to?: string;
    value?: bigint;
    data?: string;
    chainId: number;
  }) => Promise<{ transactionHash: string }>;
  /// Optional in thirdweb's type: not every account supports batching.
  sendBatchTransaction?: (
    txs: Array<{ to?: string; value?: bigint; data?: string; chainId: number }>,
  ) => Promise<{ transactionHash: string }>;
  signMessage: (args: { message: { raw: string } }) => Promise<string>;
  signTypedData: (typedData: unknown) => Promise<string>;
};

export type InAppBatchCall = { to: string; data?: string; value?: bigint };

export type InAppProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

/// EIP-1193 over a thirdweb account.
///
/// `chainId` is fixed because an in-app wallet is created against one chain, and
/// the app is single-chain. `wallet_switchEthereumChain` therefore resolves
/// rather than throws — the connect path calls it, and erroring there would make
/// a working wallet look broken.
export function inAppProvider(account: InAppAccount, chainId: number): InAppProvider {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    async request({ method, params = [] }) {
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [getAddress(account.address)];
        case "eth_chainId":
          return `0x${chainId.toString(16)}`;
        case "eth_sendTransaction": {
          const [tx] = params as [{ to?: string; value?: string; data?: string }];
          const result = await account.sendTransaction({
            ...(tx.to ? { to: tx.to } : {}),
            ...(tx.value ? { value: BigInt(tx.value) } : {}),
            ...(tx.data ? { data: tx.data } : {}),
            chainId,
          });
          return result.transactionHash as Hex;
        }
        case "personal_sign": {
          const [message] = params as [string];
          return account.signMessage({ message: { raw: message } });
        }
        case "eth_signTypedData_v4": {
          const [, json] = params as [string, string];
          return account.signTypedData(JSON.parse(json));
        }
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        default:
          throw new Error(`The in-app wallet does not implement ${method}.`);
      }
    },
    on(event, handler) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
    },
    removeListener(event, handler) {
      listeners.get(event)?.delete(handler);
    },
  };
}

/// Loads the SDK on demand. The whole point of the dynamic import is that a
/// visitor who never opens the in-app wallet never downloads it — thirdweb
/// bundles WalletConnect, the MetaMask SDK and its own UI.
///
/// **Import `inAppWallet` from `thirdweb/wallets/in-app`, not `thirdweb/wallets`.**
/// The broader entry point eagerly pulls every wallet implementation it knows,
/// including Base Account, which drags in `@base-org/account` → Coinbase's
/// `@coinbase/cdp-sdk` → `@x402/svm/exact/client` — a Solana x402 package that
/// is not installed and is not a dependency of anything here. The build fails on
/// it with "Module not found". The narrow entry exports `inAppWallet` and
/// `preAuthenticate` and references none of that.
async function loadSdk() {
  const [{ createThirdwebClient }, wallets, chains] = await Promise.all([
    import("thirdweb"),
    import("thirdweb/wallets/in-app"),
    import("thirdweb/chains"),
  ]);
  const client = createThirdwebClient({ clientId: CLIENT_ID });
  // `executionMode: EIP7702` upgrades the account in place and turns on
  // sponsored gas, which is Phase 2's second piece — same address, no second
  // deployment, and it degrades to a plain EOA on chains without 7702.
  const wallet = wallets.inAppWallet({
    executionMode: { mode: "EIP7702", sponsorGas: true },
  });
  return { client, wallet, preAuthenticate: wallets.preAuthenticate, chains };
}

/// Sends the email verification code. Separate from `completeEmailAuth` because
/// the UI is two steps: address first, then the code.
export async function startEmailAuth(email: string): Promise<void> {
  const { client, preAuthenticate } = await loadSdk();
  try {
    await preAuthenticate({ client, strategy: "email", email });
  } catch (cause) {
    throw describeAuthError(cause);
  }
}

/// thirdweb enforces a per-key allowlist of origins. When the current origin is
/// not on it, the request is blocked before it can answer and the SDK surfaces a
/// bare "Failed to fetch" — the real reason only appears in the tab thirdweb
/// opens.
///
/// The hint below is a **guess**, so the original message is never swallowed: if
/// thirdweb said something specific, that is what the caller sees. Only the
/// content-free variants get replaced, because "Failed to fetch" tells the
/// person looking at the app nothing at all.
function describeAuthError(cause: unknown): Error {
  const message = (cause instanceof Error ? cause.message : String(cause)).trim();
  console.error("[in-app-wallet] thirdweb auth failed:", cause);

  if (/^(failed to fetch|load failed|network ?error)$/i.test(message)) {
    return new Error(
      "Could not reach thirdweb. This usually means the current origin is not an " +
        "allowed domain on the API key — check it at https://thirdweb.com/dashboard.",
    );
  }
  return new Error(`thirdweb: ${message}`);
}

export async function completeEmailAuth(
  email: string,
  verificationCode: string,
  chainId: number,
): Promise<InAppProvider> {
  const { client, wallet, chains } = await loadSdk();
  const chain = chainId === 80002 ? chains.polygonAmoy : chains.polygon;
  try {
    const account = await wallet.connect({ client, chain, strategy: "email", email, verificationCode });
    activeWallet = wallet;
    activeAccount = account as unknown as InAppAccount;
    return inAppProvider(account as unknown as InAppAccount, chainId);
  } catch (cause) {
    throw describeAuthError(cause);
  }
}

export type SocialStrategy = "google" | "apple" | "discord" | "github" | "x";

export async function connectSocial(strategy: SocialStrategy, chainId: number): Promise<InAppProvider> {
  const { client, wallet, chains } = await loadSdk();
  const chain = chainId === 80002 ? chains.polygonAmoy : chains.polygon;
  try {
    const account = await wallet.connect({ client, chain, strategy });
    activeWallet = wallet;
    activeAccount = account as unknown as InAppAccount;
    return inAppProvider(account as unknown as InAppAccount, chainId);
  } catch (cause) {
    throw describeAuthError(cause);
  }
}

/// The connected wallet, kept so `disconnectInAppWallet` can clear the SDK's own
/// session. Without that the next page load silently reconnects to the same
/// address, and "disconnect" would look like it did nothing.
let activeWallet: { disconnect: () => Promise<void> } | null = null;
/// The connected account, kept for the batch path. Batching is a capability of
/// the smart account, not of EIP-1193, so it cannot travel through `request`.
let activeAccount: InAppAccount | null = null;

/// Whether the connected account can submit several calls in one transaction.
///
/// This is the reason the in-app wallet is worth having beyond onboarding:
/// equipping a mod is `approve` + `equip`, listing on the marketplace is
/// `approve` + `list`, and today each of those is a separate signature prompt.
/// On an EIP-7702 smart account they collapse into one.
export function supportsBatching(): boolean {
  return typeof activeAccount?.sendBatchTransaction === "function";
}

/// Submits every call as a single transaction. Throws when the connected account
/// cannot batch, so a caller never silently gets N prompts instead of one.
export async function sendBatchCalls(calls: InAppBatchCall[], chainId: number): Promise<string> {
  const account = activeAccount;
  if (!account) throw new Error("This wallet cannot batch calls.");
  return batchCallsWith(account, calls, chainId);
}

/// The pure core, separated from the module state so it can be tested without a
/// client ID. Maps this app's call shape onto thirdweb's `sendBatchTransaction`
/// and refuses a call list that would do nothing.
export async function batchCallsWith(
  account: InAppAccount,
  calls: InAppBatchCall[],
  chainId: number,
): Promise<string> {
  if (!account.sendBatchTransaction) throw new Error("This wallet cannot batch calls.");
  if (calls.length === 0) throw new Error("Nothing to submit.");
  const result = await account.sendBatchTransaction(
    calls.map((call) => ({
      to: call.to,
      ...(call.value !== undefined ? { value: call.value } : {}),
      ...(call.data ? { data: call.data } : {}),
      chainId,
    })),
  );
  return result.transactionHash;
}

export async function disconnectInAppWallet(): Promise<void> {
  const wallet = activeWallet;
  activeWallet = null;
  activeAccount = null;
  if (!wallet) return;
  try {
    await wallet.disconnect();
  } catch {
    // A failed SDK disconnect must not block the local state from clearing.
  }
}
