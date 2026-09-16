/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The module pages are copied into public/ by scripts/copy-modules.mjs and served as-is at the
  // same paths they have on the broker and the cleaner. Their directory URLs (/survey/, /factory/)
  // are mapped to index.html in middleware.js; the trailing-slash redirect is skipped so both
  // spellings reach it.
  skipTrailingSlashRedirect: true,
};
export default nextConfig;
