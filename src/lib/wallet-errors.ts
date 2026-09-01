export function describeWalletError(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/401|api key disabled|tenant disabled|polygon-rpc\.com/i.test(message)) {
    return "The configured Polygon RPC is unavailable. Restart the app after setting NEXT_PUBLIC_POLYGON_RPC_URL to a working endpoint.";
  }
  if (/4001|user rejected|rejected/i.test(message)) {
    return "The wallet request was rejected.";
  }
  if (/-32002|already pending/i.test(message)) {
    return "A wallet request is already pending. Open your wallet and finish it first.";
  }
  if (/insufficient funds|balance too low/i.test(message)) {
    return "This wallet does not have enough POL to complete the request.";
  }
  return fallback;
}
