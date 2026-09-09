import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";

/**
 * Token image proxy.
 *
 * Public IPFS gateways refuse browser traffic — ipfs.io answers a plain
 * server request with 200 but returns 403 to anything sending a browser
 * User-Agent, so <img> tags pointed straight at a gateway render as broken
 * icons. Fetching server-side and re-serving sidesteps that, and lets us fall
 * back across gateways and cache aggressively (a CID is immutable).
 *
 * Logo URLs come from on-chain strings, which are attacker-controlled, so the
 * target is validated before we fetch it — see assertPublicHttps.
 */

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** Gateways tried in order when the request is for an IPFS CID. */
const GATEWAYS = [
  "https://cloudflare-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/**
 * Reject anything that is not a plain https URL pointing at a public host.
 * Without this the proxy would happily fetch internal addresses on behalf of
 * whoever deployed the token contract.
 */
async function assertPublicHttps(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("https only");
  if (u.port && u.port !== "443") throw new Error("bad port");

  const { address } = await lookup(u.hostname);
  if (
    PRIVATE_V4.test(address) ||
    address === "::1" ||
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    address.startsWith("fe80")
  ) {
    throw new Error("private address");
  }
  return u;
}

/** Expand an ipfs:// URI or bare CID into the gateway list, in order. */
function candidatesFor(src: string): string[] {
  const cid =
    src.match(/^ipfs:\/\/(.+)$/)?.[1] ??
    src.match(/\/ipfs\/([^?#]+)$/)?.[1] ??
    (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z2-7]{57,})$/.test(src) ? src : null);
  return cid ? GATEWAYS.map((g) => g + cid) : [src];
}

/**
 * Some launchpads point logo() at a JSON metadata document instead of an
 * image. Read it and hand back the image URL it names. Handled here as well
 * as at write time so a logo still resolves when the gateway refused us
 * during the pool scan.
 */
async function imageFromMetadata(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const target = await assertPublicHttps(url);
    const res = await fetch(target, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { accept: "application/json", "user-agent": "refract-image-proxy/1.0" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("json") && !type.includes("text/plain")) return null;
    const meta = (await res.json()) as { image?: unknown };
    return typeof meta?.image === "string" && meta.image.trim() ? meta.image.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch one URL, enforcing the timeout, content type and size cap. */
async function fetchImage(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const target = await assertPublicHttps(url);
    const res = await fetch(target, {
      signal: ctrl.signal,
      redirect: "follow",
      // A gateway that blocks browsers still answers a plain client.
      headers: { accept: "image/*", "user-agent": "refract-image-proxy/1.0" },
    });
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;

    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": type,
        // Content-addressed, so it can be cached hard.
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src");
  if (!src) return new NextResponse(null, { status: 400 });

  // Walk the gateway list so one refusing us is not fatal.
  for (const url of candidatesFor(src)) {
    const hit = await fetchImage(url);
    if (hit) return hit;
  }

  // Nothing served an image. It may be a metadata document pointing at one.
  for (const url of candidatesFor(src)) {
    const image = await imageFromMetadata(url);
    if (!image) continue;
    for (const candidate of candidatesFor(image)) {
      const hit = await fetchImage(candidate);
      if (hit) return hit;
    }
    break;
  }

  // Nothing served it. 404 keeps the client on its generated fallback.
  return new NextResponse(null, {
    status: 404,
    headers: { "cache-control": "public, max-age=300" },
  });
}
