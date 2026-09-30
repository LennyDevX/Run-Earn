export function describeWalletError(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/401|403|429|rate.?limit|api key disabled|tenant disabled|fetch failed|failed to fetch|network error|timed out|timeout|econn|http request failed|polygon-rpc\.com/i.test(message)) {
    return "Polygon RPC endpoints are unavailable or rate-limited. The app tried its backup endpoint; retry in a moment or configure NEXT_PUBLIC_POLYGON_RPC_URL.";
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
