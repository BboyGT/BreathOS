// FIX: not-found.tsx must NOT be "use client" at the page level.
// Next.js 16 App Router requires not-found.tsx to be a Server Component
// (or at minimum not directly "use client") so the bundler can include it in
// the server-side route manifest. Having "use client" here caused the
// "Could not find module in React Client Manifest" error. The animated
// content is extracted to a client child component below.

import NotFoundClient from "./not-found-client";

export default function NotFound() {
  return <NotFoundClient />;
}
