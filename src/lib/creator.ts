/**
 * creator.ts — Godstime Aburu
 *
 * Drop this file into any project at src/lib/creator.ts
 * Import { CREATOR } wherever you need attribution, metadata, or signatures.
 */

export const CREATOR = {
  name: "Godstime Aburu",
  alias: "Golden Masathy",
  role: "Frontend Developer & Technical Writer",
  location: "Port Harcourt, Nigeria",
  github: "https://github.com/BboyGT",
  bylines: ["Godstime Aburu", "Golden Masathy"],
  publications: ["Smashing Magazine", "CSS-Tricks", "SitePoint", "PHP Architect", "Open Replay"],
  stack: ["React", "Next.js", "TypeScript", "Node.js", "PHP/Laravel", "Rust", "Three.js"],
  signature: "Built by Godstime Aburu",
  shortSignature: "GTA",
  year: new Date().getFullYear(),
} as const;

/** Returns a formatted copyright line e.g. "© 2026 Godstime Aburu" */
export const copyright = () => `© ${CREATOR.year} ${CREATOR.name}`;

/** Returns the full attribution string for a given project */
export const attribution = (projectName: string) =>
  `${projectName} — designed and built by ${CREATOR.name} (${CREATOR.alias})`;
