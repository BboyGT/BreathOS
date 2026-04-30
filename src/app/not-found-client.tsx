"use client";

// not-found-client.tsx — the animated 404 content.
// Separated from not-found.tsx so the page-level file can remain a Server
// Component while still using framer-motion (which requires a client boundary).

import { motion } from "framer-motion";
import Link from "next/link";

export default function NotFoundClient() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#030b14 0%,#0a1628 50%,#061220 100%)",
        padding: 24,
        fontFamily: "Georgia, serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "20%", left: "15%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(127,255,212,0.06) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "15%", width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(135,206,235,0.05) 0%, transparent 70%)", filter: "blur(40px)" }} />
      </div>

      {/* Grain overlay */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.035, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "128px 128px" }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 480 }}
      >
        <motion.div
          animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: 120, height: 120, borderRadius: "50%", border: "1px solid rgba(127,255,212,0.2)", background: "radial-gradient(circle, rgba(127,255,212,0.1) 0%, transparent 70%)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 32px", boxShadow: "0 0 40px rgba(127,255,212,0.08)" }}
        >
          <span style={{ fontSize: 42, filter: "drop-shadow(0 0 12px rgba(127,255,212,0.6))" }}>🌿</span>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: "rgba(127,255,212,0.45)", letterSpacing: 5, textTransform: "uppercase", marginBottom: 16 }}>
          404
        </motion.p>

        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 400, color: "#7fffd4", marginBottom: 16, lineHeight: 1.2 }}>
          Page Not Found
        </motion.h1>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
          style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: "rgba(232,244,240,0.5)", lineHeight: 1.7, marginBottom: 36 }}>
          This page seems to have drifted away on the exhale. Take a breath — your dashboard is just a click back.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <Link href="/"
            style={{ display: "inline-block", background: "linear-gradient(135deg, rgba(15,46,36,0.9), rgba(26,74,56,0.9))", border: "1px solid rgba(127,255,212,0.25)", color: "#7fffd4", padding: "14px 36px", borderRadius: 8, textDecoration: "none", fontFamily: "'Cormorant Garamond', serif", fontSize: 14, letterSpacing: "2.5px", textTransform: "uppercase", transition: "all 0.25s" }}>
            Return Home
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
