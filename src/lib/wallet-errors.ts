export function describeWalletError(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : String(cause);

  // Three failures that used to share one unhelpful sentence. They have different
  // causes and different fixes, and telling them apart is the difference between a
  // visitor retrying and a developer reconfiguring.
  if (/429|rate.?limit|too many requests|-32029/i.test(message)) {
    return "The Polygon RPC is rate-limiting this app. Retry in a moment — or point NEXT_PUBLIC_POLYGON_RPC_URL at a dedicated provider, because the public endpoints are shared and throttle under real traffic.";
  }
  if (/401|403|api key disabled|tenant disabled|unauthorized/i.test(message)) {
    return "The Polygon RPC rejected the request: the API key is invalid, disabled, or not allowed for this domain. Check NEXT_PUBLIC_POLYGON_RPC_URL.";
  }
  if (/err_ssl|econnrefused|enotfound|certificate|handshake/i.test(message)) {
    return "The Polygon RPC could not be reached at all — the endpoint is down, or this network blocks it. Retrying will not help; change NEXT_PUBLIC_POLYGON_RPC_URL.";
  }
  if (/fetch failed|failed to fetch|network error|timed out|timeout|econn|http request failed|polygon-rpc\.com/i.test(message)) {
    return "The Polygon RPC did not answer in time. The app tried its fallbacks; retry, and if it keeps happening the configured endpoint is unhealthy.";
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
