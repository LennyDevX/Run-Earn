import type { OKXUniversalProvider } from "@okxconnect/universal-provider";

export type BrowserEvmProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

const APP_NAME = "RUN&EARN";

type MetaMaskProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: never, listener: never) => unknown;
  removeListener?: (event: never, listener: never) => unknown;
};

let metaMaskClient: Awaited<ReturnType<typeof import("@metamask/connect-evm").createEVMClient>> | null = null;
let okxClient: OKXUniversalProvider | null = null;

function wrapMetaMaskProvider(provider: MetaMaskProvider): BrowserEvmProvider {
  return {
    request: (args) => provider.request(args),
    on: (event, listener) => { provider.on?.(event as never, listener as never); },
    removeListener: (event, listener) => { provider.removeListener?.(event as never, listener as never); },
  };
}

export async function connectMetaMaskMobile(chainId: number, rpcUrl: string) {
  const { createEVMClient } = await import("@metamask/connect-evm");
  metaMaskClient ??= await createEVMClient({
    dapp: {
      name: APP_NAME,
      url: window.location.origin,
      iconUrl: `${window.location.origin}/icon.svg`,
    },
    api: {
      supportedNetworks: {
        [`0x${chainId.toString(16)}`]: rpcUrl,
      },
    },
    mobile: {
      useDeeplink: true,
    },
  });

  await metaMaskClient.connect({ chainIds: [`0x${chainId.toString(16)}`] });
  return wrapMetaMaskProvider(metaMaskClient.getProvider());
}

export async function connectOkxMobile(chainId: number): Promise<BrowserEvmProvider> {
  const { OKXUniversalProvider } = await import("@okxconnect/universal-provider");
  okxClient ??= await OKXUniversalProvider.init({
    dappMetaData: {
      name: APP_NAME,
      icon: `${window.location.origin}/icon.svg`,
    },
  });

  await okxClient.connect({
    namespaces: {
      eip155: {
        chains: [`eip155:${chainId}`],
        defaultChain: String(chainId),
      },
    },
    sessionConfig: {
      redirect: window.location.href,
    },
  });

  const provider = okxClient;
  return {
    request: (args) => provider.request(args, `eip155:${chainId}`),
    on: (event, listener) => { provider.on(event, listener); },
    removeListener: (event, listener) => { provider.removeListener(event, listener); },
  };
}

export async function disconnectMobileWallet(wallet: "metamask" | "okx" | null) {
  if (wallet === "metamask" && metaMaskClient) await metaMaskClient.disconnect();
  if (wallet === "okx" && okxClient) await okxClient.disconnect();
}
