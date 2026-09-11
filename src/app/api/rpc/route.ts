import { NextResponse } from "next/server";
import { RPC_SERVER } from "@/lib/chain";

/**
 * JSON-RPC proxy, so the browser can use the paid endpoint without holding
 * its key.
 *
 * The obvious alternative is to put the authenticated URL in
 * NEXT_PUBLIC_RPC_URL, and NEXT_PUBLIC_ values are inlined into the client
 * bundle at build time, so that publishes the key to every visitor and to
 * anyone who reads the JavaScript. There is no version of that which is
 * private.
 *
 * Requests are forwarded verbatim, with the key attached here. Methods are
 * allowlisted rather than open: this is a paid endpoint on a public URL, and
 * an open proxy is someone else's free RPC until the bill arrives.
 *
 * Worth being clear about the privacy consequence, since this app makes
 * privacy claims. A shielded balance is rebuilt by reading logs, so whoever
 * serves those reads can see which notes a visitor is interested in. Routing
 * through here means the upstream provider sees this server rather than the
 * visitor, and it means this server could see the visitor instead. Nothing is
 * logged here, and that is a promise about configuration rather than a
 * property of the design, which is exactly why the page says an RPC provider
 * sees both ends.
 */

/** Everything the app actually calls. Anything else is rejected. */
const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getLogs",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_sendRawTransaction",
  "net_version",
]);

type RpcCall = { method?: unknown; id?: unknown };

const rejected = (id: unknown, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code: -32601, message },
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rejected(null, "Malformed JSON-RPC request."), { status: 400 });
  }

  // viem batches, so a body is either one call or an array of them.
  const calls: RpcCall[] = Array.isArray(body) ? (body as RpcCall[]) : [body as RpcCall];
  if (calls.length === 0 || calls.length > 64) {
    return NextResponse.json(rejected(null, "Batch size out of range."), { status: 400 });
  }

  const blocked = calls.find((c) => typeof c?.method !== "string" || !ALLOWED.has(c.method as string));
  if (blocked) {
    return NextResponse.json(
      rejected(blocked.id, `Method not available through this endpoint: ${String(blocked.method)}`),
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(RPC_SERVER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // Long enough for a wide getLogs, short enough to fail rather than hang.
      signal: AbortSignal.timeout(20_000),
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Upstream RPC unavailable." } },
      { status: 502 },
    );
  }
}
