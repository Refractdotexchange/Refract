/**
 * Token art resolution.
 *
 * Launchpad tokens on chain 4663 expose a non-standard `logo()`. It returns
 * one of two things depending on which launchpad minted the token:
 *
 *   - the image itself (content-type image/*), or
 *   - a JSON metadata document whose `image` field holds the real CID.
 *
 * Pointing an <img> at the second kind renders nothing, so the indirection is
 * followed here, on the server, once per CID.
 */

/**
 * Gateway used to resolve ipfs:// URIs. Gateways go down and rate-limit, so
 * callers should keep a fallback under the image rather than trust this.
 */
export const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://ipfs.io/ipfs/";

const BARE_CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z2-7]{57,})$/;

/** ipfs://<cid>[/path] -> gateway URL. http(s) and data: pass through. */
export function toHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("ipfs://")) {
    return IPFS_GATEWAY + v.slice("ipfs://".length).replace(/^ipfs\//, "");
  }
  if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:")) return v;
  if (BARE_CID.test(v)) return IPFS_GATEWAY + v;
  return null;
}

/** A CID is immutable, so a resolution is cached for the process lifetime. */
const cache = new Map<string, string | null>();

/** Follow a logo URL through metadata JSON, if that is what it points at. */
export async function followLogo(url: string): Promise<string | null> {
  const hit = cache.get(url);
  if (hit !== undefined) return hit;

  let out: string | null = url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      out = null;
    } else if (type.includes("json") || type.includes("text/plain")) {
      const meta = (await res.json()) as { image?: unknown };
      out = toHttpUrl(meta?.image) ?? null;
    } else {
      // Already an image. Drop the body instead of streaming a full-size
      // asset the server has no use for.
      ctrl.abort();
    }
  } catch {
    // Gateway down, slow, or our own abort. Keep the URL and let the caller's
    // fallback cover it if it does not render.
  } finally {
    clearTimeout(timer);
  }

  cache.set(url, out);
  return out;
}

/** Raw `logo()` output -> a usable image URL, following metadata if needed. */
export async function resolveTokenLogo(raw: unknown): Promise<string | null> {
  const url = toHttpUrl(raw);
  return url ? followLogo(url) : null;
}

/** Resolve a batch's distinct logo URLs a few at a time, then apply them. */
export async function hydrateLogos<T extends { logoUrl: string | null }>(
  rows: T[],
): Promise<void> {
  const unique = [...new Set(rows.map((r) => r.logoUrl).filter((u): u is string => !!u))];
  const pending = unique.filter((u) => !cache.has(u));

  const CONCURRENCY = 8;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(pending.slice(i, i + CONCURRENCY).map((u) => followLogo(u)));
  }
  for (const r of rows) {
    if (r.logoUrl) r.logoUrl = cache.get(r.logoUrl) ?? r.logoUrl;
  }
}
