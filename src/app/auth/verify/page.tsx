"use client";
import { motion } from "framer-motion";

export default function VerifyPage() {
  return (
    <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg,#030b14 0%,#0a1628 50%,#061220 100%)", padding:24 }}>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}
        style={{ background:"rgba(127,255,212,0.04)", border:"1px solid rgba(127,255,212,0.15)",
          borderRadius:16, padding:40, maxWidth:380, width:"100%", textAlign:"center",
          backdropFilter:"blur(16px)" }}>
        <div style={{fontSize:52, marginBottom:16}}>📬</div>
        <h1 style={{fontFamily:"'Playfair Display',serif", fontSize:28, color:"#7fffd4", marginBottom:12}}>
          Check your email
        </h1>
        <p style={{fontFamily:"'Cormorant Garamond',serif", fontSize:15, color:"rgba(232,244,240,0.6)", lineHeight:1.7}}>
          A sign-in link was sent to your inbox. Click it to continue — the link expires in 24 hours.
        </p>
        <p style={{fontFamily:"'Cormorant Garamond',serif", fontSize:13, color:"rgba(127,255,212,0.4)",
          marginTop:20, lineHeight:1.6}}>
          Didn&apos;t get it? Check your spam folder or go back and try again.
        </p>
      </motion.div>
    </div>
  );
}
