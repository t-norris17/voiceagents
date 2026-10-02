"use client";
// The portal's masthead on the Next.js pages: the same markup the copied module pages get at build
// (lib/mast.js), with the current page marked. Plain anchors, so every move is a full page load and
// the theme control is never re-rendered under the viewer.
import { usePathname } from "next/navigation";
import { mastHtml } from "../../lib/mast.js";

export default function Masthead() {
  const p = usePathname() || "/";
  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: mastHtml(p) }} />;
}
