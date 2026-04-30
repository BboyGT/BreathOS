"use client";

// HomeClient.tsx — the client boundary for the home route.
// Wraps SessionProvider (which requires client context) around the dynamic
// BreatheOS import. Keeping this separate from page.tsx lets page.tsx stay
// a Server Component, which is required for Turbopack's Client Manifest to
// resolve correctly in Next.js 16 App Router.

import { SessionProvider } from "next-auth/react";
import dynamic from "next/dynamic";

const BreatheOS = dynamic(() => import("@/components/breatheos"), { ssr: false });

export default function HomeClient() {
  return (
    <SessionProvider>
      <BreatheOS />
    </SessionProvider>
  );
}
