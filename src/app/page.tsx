// FIX: page.tsx must NOT be "use client". Having "use client" on a page.tsx
// that uses next/dynamic causes Turbopack (Next.js 16) to fail to generate
// the React Client Manifest, producing the "Could not find module in React
// Client Manifest" crash. The fix is to make this file a Server Component and
// push SessionProvider + BreatheOS into a dedicated client wrapper.

import HomeClient from "@/components/HomeClient";

export default function Home() {
  return <HomeClient />;
}
