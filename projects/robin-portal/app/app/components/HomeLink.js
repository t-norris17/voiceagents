"use client";
// The same "Robin portal" pill the copied module pages get at build (scripts/copy-modules.mjs), so
// every room has the same way back. Hidden on the landing page itself.
import { usePathname } from "next/navigation";

export default function HomeLink() {
  const p = usePathname();
  if (!p || p === "/") return null;
  return <a id="rp-home" href="/" aria-label="Back to the Robin portal">&larr; Robin portal</a>;
}
