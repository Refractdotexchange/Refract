import type { Metadata } from "next";
import { isAddress } from "viem";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TokenDetail } from "@/components/token-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  return { title: `Token ${address.slice(0, 10)}…` };
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "34px 22px 0" }}>
      <Link
        href="/pools"
        style={{ color: "var(--muted)", fontSize: 13.5, textDecoration: "none", display: "inline-block", marginBottom: 20 }}
      >
        ← All pools
      </Link>
      <TokenDetail address={address} />
    </div>
  );
}
