"use client";

/**
 * CreatorSignature.tsx — Godstime Aburu
 *
 * A subtle, reusable signature component for all projects.
 * Renders a small fixed badge in the bottom-right corner by default,
 * or inline when variant="inline".
 *
 * Usage:
 *   import CreatorSignature from "@/components/CreatorSignature";
 *   <CreatorSignature />                   // fixed bottom-right badge
 *   <CreatorSignature variant="inline" />  // inline footer text
 *   <CreatorSignature variant="console" /> // console.log only, invisible
 */

import { useEffect } from "react";
import { CREATOR } from "@/lib/creator";

interface Props {
  variant?: "badge" | "inline" | "console";
  projectName?: string;
}

export default function CreatorSignature({ variant = "badge", projectName }: Props) {
  // Always log to console — visible to anyone who opens DevTools
  useEffect(() => {
    console.log(
      `%c ${CREATOR.name} %c ${CREATOR.alias} %c\n${CREATOR.role} · ${CREATOR.location}\n${CREATOR.github}${projectName ? `\n\nProject: ${projectName}` : ""}`,
      "background:#030b14;color:#7fffd4;font-weight:bold;padding:4px 8px;font-family:monospace;font-size:13px;",
      "background:#0a1628;color:rgba(127,255,212,0.6);padding:4px 8px;font-family:monospace;font-size:12px;",
      "color:rgba(127,255,212,0.4);font-family:monospace;font-size:11px;padding-left:4px;"
    );
  }, [projectName]);

  if (variant === "console") return null;

  if (variant === "inline") {
    return (
      <p style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 11,
        color: "rgba(127,255,212,0.25)",
        letterSpacing: 2,
        textTransform: "uppercase",
        textAlign: "center",
        padding: "12px 0",
        userSelect: "none",
      }}>
        {CREATOR.name} · {CREATOR.alias}
      </p>
    );
  }

  // Default: fixed badge — monogram circle only, no text label
  return (
    <a
      href={CREATOR.github}
      target="_blank"
      rel="noopener noreferrer"
      title={`${CREATOR.name} · ${CREATOR.alias} — ${CREATOR.role}`}
      style={{
        position: "fixed",
        bottom: "max(88px, calc(env(safe-area-inset-bottom, 0px) + 88px))",
        right: 16,
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        background: "rgba(3,11,20,0.75)",
        border: "1px solid rgba(127,255,212,0.12)",
        borderRadius: "50%",
        padding: 5,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        textDecoration: "none",
        cursor: "pointer",
        transition: "all 0.2s",
        opacity: 0.55,
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "0.55")}
    >
      {/* Monogram circle only — no text label beside it */}
      <span style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: "linear-gradient(135deg, rgba(127,255,212,0.2), rgba(135,206,235,0.12))",
        border: "1px solid rgba(127,255,212,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: 10,
        color: "#7fffd4",
        flexShrink: 0,
        lineHeight: 1,
        userSelect: "none",
      }}>
        {CREATOR.shortSignature}
      </span>
    </a>
  );
}
