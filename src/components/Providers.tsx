"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import { connectMetaMaskMobile, connectOkxMobile, disconnectMobileWallet, type BrowserEvmProvider } from "@/lib/wallet-connect";
import { describeWalletError } from "@/lib/wallet-errors";
import { SneakerOwnershipProvider } from "@/components/SneakerOwnershipProvider";
import {
  completeEmailAuth,
  connectSocial,
  disconnectInAppWallet,
  inAppWalletAvailable,
  sendBatchCalls,
  startEmailAuth,
  supportsBatching,
  type InAppBatchCall,
  type SocialStrategy,
} from "@/lib/in-app-wallet";

export type PolygonNetwork = "polygon" | "amoy";
export type WalletId = "metamask" | "okx" | "in-app" | `injected:${string}`;
export type WalletOption = {
  id: WalletId;
  label: string;
  installed: boolean;
  kind: "injected" | "mobile-sdk" | "embedded";
};

type EthereumProvider = BrowserEvmProvider & {
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
};

type EIP6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EthereumProvider;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export const NETWORK: PolygonNetwork =
  process.env.NEXT_PUBLIC_POLYGON_NETWORK === "amoy" ? "amoy" : "polygon";

export const CHAIN = NETWORK === "polygon" ? polygon : polygonAmoy;
export const NETWORK_LABEL = NETWORK === "polygon" ? "Polygon Mainnet" : "Polygon Amoy";

export const EXPLORER =
  process.env.NEXT_PUBLIC_POLYGON_EXPLORER ??
  (NETWORK === "polygon" ? "https://polygonscan.com" : "https://amoy.polygonscan.com");

const configuredRpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC_URL?.trim();

function isValidRpcUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

const rpcUrl = configuredRpcUrl && isValidRpcUrl(configuredRpcUrl)
  ? configuredRpcUrl
  : CHAIN.rpcUrls.default.http[0];
const backupRpcUrl = NETWORK === "polygon"
  ? "https://polygon.api.onfinality.io/public"
  : "https://polygon-amoy.api.onfinality.io/public";
const readRpcUrls = [...new Set([rpcUrl, ...CHAIN.rpcUrls.default.http, backupRpcUrl])];

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: fallback(readRpcUrls.map((url) => http(url, { retryCount: 1, retryDelay: 250, timeout: 8_000 }))),
});

export const explorerAccountUrl = (walletAddress: string) =>
  `${EXPLORER.replace(/\/$/, "")}/address/${walletAddress}`;

export const explorerTransactionUrl = (hash: string) =>
  `${EXPLORER.replace(/\/$/, "")}/tx/${hash}`;

type PolygonWalletContext = {
  address: Address | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  isMobile: boolean;
  walletType: WalletId | null;
  walletOptions: WalletOption[];
  error: string | null;
  publicClient: PublicClient;
  connect: (walletId?: WalletId) => Promise<void>;
  disconnect: () => void;
  switchToPolygon: () => Promise<void>;
  sendNative: (to: Address, value: bigint) => Promise<Hash>;
  sendContractCall: (to: Address, data: Hex, value?: bigint) => Promise<Hash>;
  /// In-app wallet (thirdweb): email/social onboarding with no browser
  /// extension. False when `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` is unset, in which
  /// case the option never appears and the SDK is never downloaded.
  inAppAvailable: boolean;
  startInAppEmail: (email: string) => Promise<void>;
  completeInAppEmail: (email: string, code: string) => Promise<void>;
  connectInAppSocial: (strategy: SocialStrategy) => Promise<void>;
  /// True when the connected account can submit several calls in one
  /// transaction. Only the in-app EIP-7702 smart account can; every other wallet
  /// falls back to one prompt per call.
  supportsBatching: boolean;
  sendBatch: (calls: InAppBatchCall[]) => Promise<Hash>;
};

const WalletContext = createContext<PolygonWalletContext | null>(null);

export function usePolygonWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("usePolygonWallet must be used within Providers");
  return context;
}

function getInjectedFallback() {
  return typeof window !== "undefined" ? window.ethereum : undefined;
}

function toAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  return getAddress(value);
}

function parseChainId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function isProviderFor(detail: EIP6963ProviderDetail, wallet: "okx" | "metamask") {
  const haystack = `${detail.info.name} ${detail.info.rdns}`.toLowerCase();
  return wallet === "okx" ? haystack.includes("okx") || detail.provider.isOkxWallet === true : haystack.includes("metamask") || detail.provider.isMetaMask === true;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [walletType, setWalletType] = useState<WalletId | null>(null);
  const [discovered, setDiscovered] = useState<EIP6963ProviderDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activeProvider = useRef<EthereumProvider | null>(null);
  const activeCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsMobile(/Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent));
    });
    const handleAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
      if (!detail?.info?.uuid || !detail.provider?.request) return;
      setDiscovered((current) => current.some((item) => item.info.uuid === detail.info.uuid) ? current : [...current, detail]);
    };
    window.addEventListener("eip6963:announceProvider", handleAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("eip6963:announceProvider", handleAnnounce);
    };
  }, []);

  const walletOptions = useMemo<WalletOption[]>(() => {
    const fallback = getInjectedFallback();
    const okxInstalled = discovered.some((detail) => isProviderFor(detail, "okx")) || fallback?.isOkxWallet === true;
    const metamaskInstalled = discovered.some((detail) => isProviderFor(detail, "metamask")) || fallback?.isMetaMask === true;
    const options: WalletOption[] = [
      { id: "okx", label: "OKX Wallet", installed: okxInstalled, kind: okxInstalled ? "injected" : "mobile-sdk" },
      { id: "metamask", label: "MetaMask", installed: metamaskInstalled, kind: metamaskInstalled ? "injected" : "mobile-sdk" },
    ];
    // Listed first-class rather than appended: for someone with no extension
    // installed it is the only option that works, so it should not read as an
    // afterthought at the bottom of the list.
    if (inAppWalletAvailable()) {
      options.unshift({ id: "in-app", label: "Email or social", installed: true, kind: "embedded" });
    }
    for (const detail of discovered) {
      if (isProviderFor(detail, "okx") || isProviderFor(detail, "metamask")) continue;
      options.push({ id: `injected:${detail.info.uuid}`, label: detail.info.name, installed: true, kind: "injected" });
    }
    if (fallback && !okxInstalled && !metamaskInstalled && !discovered.length) {
      options.push({ id: "injected:legacy", label: "Browser wallet", installed: true, kind: "injected" });
    }
    return options;
  }, [discovered]);

  const providerFor = useCallback((walletId: WalletId) => {
    if (walletId === "injected:legacy") return getInjectedFallback();
    if (walletId.startsWith("injected:")) {
      return discovered.find((detail) => `injected:${detail.info.uuid}` === walletId)?.provider;
    }
    const detail = walletId === "okx" || walletId === "metamask"
      ? discovered.find((item) => isProviderFor(item, walletId))
      : undefined;
    if (detail) return detail.provider;
    const fallback = getInjectedFallback();
    if (walletId === "okx" && fallback?.isOkxWallet) return fallback;
    if (walletId === "metamask" && fallback?.isMetaMask) return fallback;
    return walletId === "okx" || walletId === "metamask" ? undefined : fallback;
  }, [discovered]);

  const syncWallet = useCallback(async (provider = activeProvider.current) => {
    if (!provider) {
      setAddress(null);
      setChainId(null);
      return;
    }
    try {
      const accounts = (await provider.request({ method: "eth_accounts", params: [] })) as unknown;
      const nextChainId = parseChainId(await provider.request({ method: "eth_chainId", params: [] }));
      setAddress(Array.isArray(accounts) ? toAddress(accounts[0]) : null);
      setChainId(nextChainId);
    } catch (cause) {
      setAddress(null);
      setChainId(null);
      setError(describeWalletError(cause, "Could not read the wallet state."));
    }
  }, []);

  const attachProvider = useCallback((provider: EthereumProvider) => {
    activeCleanup.current?.();
    const handleAccounts = (accounts: unknown) => setAddress(Array.isArray(accounts) ? toAddress(accounts[0]) : null);
    const handleChain = (nextChain: unknown) => setChainId(parseChainId(nextChain));
    const handleDisconnect = () => {
      setAddress(null);
      setChainId(null);
      setWalletType(null);
    };
    provider.on?.("accountsChanged", handleAccounts);
    provider.on?.("chainChanged", handleChain);
    provider.on?.("disconnect", handleDisconnect);
    activeCleanup.current = () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
      provider.removeListener?.("disconnect", handleDisconnect);
    };
    activeProvider.current = provider;
  }, []);

  const connect = useCallback(async (requestedWallet?: WalletId) => {
    setIsConnecting(true);
    setError(null);
    try {
      const fallback = discovered.find((detail) => isProviderFor(detail, "okx")) ?? discovered.find((detail) => isProviderFor(detail, "metamask")) ?? discovered[0];
      const walletId = requestedWallet ?? (fallback ? `injected:${fallback.info.uuid}` : isMobile ? "okx" : undefined);
      if (!walletId) throw new Error("No compatible wallet detected. Install OKX or MetaMask, or open this dApp inside a wallet app.");

      let provider = providerFor(walletId);
      if (!provider && walletId === "metamask") provider = await connectMetaMaskMobile(CHAIN.id, rpcUrl);
      if (!provider && walletId === "okx") provider = await connectOkxMobile(CHAIN.id);
      if (!provider) throw new Error(`${walletId === "okx" ? "OKX Wallet" : "MetaMask"} could not be initialized.`);

      attachProvider(provider);
      const accounts = (await provider.request({ method: "eth_requestAccounts", params: [] })) as unknown;
      const nextAddress = Array.isArray(accounts) ? toAddress(accounts[0]) : null;
      if (!nextAddress) throw new Error("The wallet did not return an account.");
      setWalletType(walletId);
      await syncWallet(provider);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the wallet.");
      throw cause;
    } finally {
      setIsConnecting(false);
    }
  }, [attachProvider, discovered, isMobile, providerFor, syncWallet]);

  /// Attaches an in-app provider and runs the same sync path as every other
  /// wallet. From here down nothing distinguishes them — the hooks read the same
  /// `address`, and `sendContractCall` reaches `eth_sendTransaction` on the
  /// adapter.
  const adoptInAppProvider = useCallback(async (provider: EthereumProvider) => {
    attachProvider(provider);
    setWalletType("in-app");
    await syncWallet(provider);
  }, [attachProvider, syncWallet]);

  const startInAppEmail = useCallback(async (email: string) => {
    setError(null);
    try {
      await startEmailAuth(email);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the verification code.");
      throw cause;
    }
  }, []);

  const completeInAppEmail = useCallback(async (email: string, code: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      await adoptInAppProvider((await completeEmailAuth(email, code, CHAIN.id)) as unknown as EthereumProvider);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete sign-in.");
      throw cause;
    } finally {
      setIsConnecting(false);
    }
  }, [adoptInAppProvider]);

  const connectInAppSocial = useCallback(async (strategy: SocialStrategy) => {
    setIsConnecting(true);
    setError(null);
    try {
      await adoptInAppProvider((await connectSocial(strategy, CHAIN.id)) as unknown as EthereumProvider);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete sign-in.");
      throw cause;
    } finally {
      setIsConnecting(false);
    }
  }, [adoptInAppProvider]);

  const switchToPolygon = useCallback(async () => {
    const provider = activeProvider.current;
    if (!provider) throw new Error("Connect your wallet before switching networks.");
    const chainIdHex = `0x${CHAIN.id.toString(16)}`;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (cause) {
      if ((cause as { code?: number }).code !== 4902) throw cause;
      await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: chainIdHex, chainName: CHAIN.name, nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, rpcUrls: [rpcUrl], blockExplorerUrls: [EXPLORER] }] });
    }
    await syncWallet(provider);
  }, [syncWallet]);

  const disconnect = useCallback(() => {
    const currentType = walletType === "okx" || walletType === "metamask" ? walletType : null;
    const wasInApp = walletType === "in-app";
    activeCleanup.current?.();
    activeCleanup.current = null;
    activeProvider.current = null;
    setAddress(null);
    setChainId(null);
    setWalletType(null);
    // The in-app wallet keeps its own session in the SDK. Clearing local state
    // alone would silently reconnect the same address on the next load.
    if (wasInApp) void disconnectInAppWallet().catch(() => undefined);
    else void disconnectMobileWallet(currentType).catch(() => undefined);
  }, [walletType]);

  const getActiveProvider = useCallback(async () => {
    const provider = activeProvider.current;
    if (!provider || !address) throw new Error("Connect your wallet before signing.");
    const currentChain = parseChainId(await provider.request({ method: "eth_chainId", params: [] }));
    if (currentChain !== CHAIN.id) throw new Error(`Wrong network. Switch to ${NETWORK_LABEL} before signing.`);
    return provider;
  }, [address]);

  const sendNative = useCallback(async (to: Address, value: bigint) => {
    if (!isAddress(to) || value <= 0n) throw new Error("Invalid recipient or POL amount.");
    const provider = await getActiveProvider();
    return (await provider.request({ method: "eth_sendTransaction", params: [{ from: address, to, value: `0x${value.toString(16)}` }] })) as Hash;
  }, [address, getActiveProvider]);

  const sendContractCall = useCallback(async (to: Address, data: Hex, value?: bigint) => {
    if (!isAddress(to)) throw new Error("Invalid contract address.");
    const provider = await getActiveProvider();
    return (await provider.request({ method: "eth_sendTransaction", params: [{ from: address, to, data, ...(value !== undefined ? { value: `0x${value.toString(16)}` } : {}) }] })) as Hash;
  }, [address, getActiveProvider]);

  /// Several calls in one transaction. Re-verifies the chain first, exactly like
  /// the single-call path — batching must not become a way to sign on the wrong
  /// network.
  const sendBatch = useCallback(async (calls: InAppBatchCall[]) => {
    if (!address) throw new Error("Connect your wallet before signing.");
    const currentChain = parseChainId(await activeProvider.current?.request({ method: "eth_chainId", params: [] }));
    if (currentChain !== CHAIN.id) throw new Error(`Wrong network. Switch to ${NETWORK_LABEL} before signing.`);
    return (await sendBatchCalls(calls, CHAIN.id)) as Hash;
  }, [address]);

  const contextValue = useMemo<PolygonWalletContext>(() => ({
    address,
    chainId,
    isConnected: Boolean(address),
    isConnecting,
    isMobile,
    walletType,
    walletOptions,
    error,
    publicClient,
    connect,
    disconnect,
    switchToPolygon,
    sendNative,
    sendContractCall,
    inAppAvailable: inAppWalletAvailable(),
    startInAppEmail,
    completeInAppEmail,
    connectInAppSocial,
    // Recomputed on every render: the capability belongs to the connected
    // account, so it changes the moment a wallet connects or disconnects.
    supportsBatching: supportsBatching(),
    sendBatch,
  }), [address, chainId, connect, completeInAppEmail, connectInAppSocial, disconnect, error, isConnecting, isMobile, sendBatch, sendContractCall, sendNative, startInAppEmail, switchToPolygon, walletOptions, walletType]);

  // Nested inside the wallet context so the ownership provider can read the
  // connected address, and above every route so there is exactly one
  // `useOwnedSneakers` instance for the whole tree.
  return (
    <WalletContext.Provider value={contextValue}>
      <SneakerOwnershipProvider>{children}</SneakerOwnershipProvider>
    </WalletContext.Provider>
  );
}
