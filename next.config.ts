import type { NextConfig } from "next";

// FIX: removed `import path from "path"` and `path.resolve(__dirname)`.
// __dirname is not defined in ESM module contexts and can cause a ReferenceError.
// process.cwd() is always available and resolves to the project root correctly.
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
  // Tells Turbopack where the project root is, preventing it from picking up
  // a stray package-lock.json at C:\Users\Straw Hat\ as the workspace root.
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
    ];
  },
};

export default nextConfig;
