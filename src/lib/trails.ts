/// The Trails funding widget authenticates from the browser, so its key has to
/// reach client code. `NEXT_PUBLIC_*` is Next's own signal for "this is public",
/// but the key may be held as a plain `TRAILS_API_KEY`; read either here, on the
/// server, and hand the value down as a prop.
///
/// Treat the result as public either way — it is visible to anyone who opens
/// the funding flow.
export function trailsApiKey(): string {
  return process.env.TRAILS_API_KEY ?? process.env.NEXT_PUBLIC_TRAILS_API_KEY ?? "";
}
