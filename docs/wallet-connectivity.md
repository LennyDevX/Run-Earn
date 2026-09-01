# RUN&EARN wallet connectivity

## Supported environments

| Environment | Connection path |
| --- | --- |
| Desktop with OKX/MetaMask extension | EIP-6963 provider discovery + EIP-1193 |
| OKX in-app browser | Injected EIP-1193 provider, discovered explicitly |
| Mobile browser without injection | Official OKX Universal Provider or MetaMask Connect EVM |
| Desktop without extension | SDK fallback; MetaMask can use QR/deeplink flow |

The main wallet choices exposed by the UI are OKX Wallet and MetaMask.

## Implemented SDKs

- `@metamask/connect-evm` `2.1.1`.
- `@okxconnect/universal-provider` `1.9.1`.
- `viem` remains the read/transaction data layer.

The SDK providers are normalized to the EIP-1193 shape used by `Providers.tsx`. This means staking and minting do not need wallet-specific transaction logic.

## Connection lifecycle

1. `Providers.tsx` listens for `eip6963:announceProvider` and requests providers with `eip6963:requestProvider`.
2. The wallet picker shows detected OKX/MetaMask providers and mobile SDK options.
3. Desktop/in-app providers call `eth_requestAccounts` directly.
4. MetaMask Connect is initialized lazily and requests Polygon or Polygon Amoy with hex chain IDs. Its mobile flow handles QR/deeplink handoff.
5. OKX Universal Provider is initialized lazily with EVM namespace `eip155:<chainId>` and a return URL. Its app handoff handles mobile deep links.
6. After connection/return, the app re-reads `eth_accounts` and `eth_chainId`.
7. Every transaction verifies the active chain before calling `eth_sendTransaction`.
8. The UI waits for the receipt in `useContractTransaction` before reporting success.

## Deep-link policy

Use the official SDK handoff rather than building arbitrary `okx://` or wallet URLs. SDK deep links can handle app opening, session transport, return, cancellation, and supported chains more reliably across iOS and Android.

The dApp must be served over HTTPS in production. Do not put secrets, session tokens, or personal data in return URLs. Only use the current allowlisted dApp origin and configured Polygon chain.

## RPC configuration

The previous `polygon-rpc.com` endpoint is no longer suitable for this setup; it returned HTTP 401 because public access was disabled for the tenant. The project now uses Polygon's documented public dRPC endpoint by default:

```env
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon.drpc.org
```

For production throughput, replace it with a dedicated provider endpoint and keep any provider API key inside the endpoint configuration according to that provider's security guidance.

## Environment configuration

No private wallet key or SDK secret is required in the browser for this integration. The following values remain public configuration:

```env
NEXT_PUBLIC_POLYGON_NETWORK=amoy
NEXT_PUBLIC_POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
NEXT_PUBLIC_POLYGON_EXPLORER=https://amoy.polygonscan.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

Keep deployer keys, explorer API keys, Graph keys, and backend credentials server-side.

## Testing matrix

- OKX Extension on desktop.
- MetaMask Extension on desktop.
- Multiple extensions installed; verify selected provider is used.
- OKX in-app browser.
- MetaMask Mobile from Safari/Chrome.
- Android and iOS handoff/return.
- User rejects connection.
- User rejects a transaction.
- SDK timeout or app not installed.
- Wrong Polygon/Amoy chain.
- Account and chain changes after connection.
- Refresh after an established mobile session.
- Deposit POL and mint/stake NFT after SDK connection.

Real mobile app handoff must be tested on physical iOS/Android devices; a desktop browser preview cannot validate OS-level deep-link behavior.
