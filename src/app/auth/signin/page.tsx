"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("email", { email, callbackUrl: "/", redirect: false });
    setSent(true);
    setLoading(false);
  }

  const glass: React.CSSProperties = {
    background: "rgba(127,255,212,0.04)",
    border: "1px solid rgba(127,255,212,0.15)",
    borderRadius: 16, padding: 32, backdropFilter: "blur(16px)",
  };

  return (
    <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg,#030b14 0%,#0a1628 50%,#061220 100%)", padding: 24 }}>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} style={{...glass, width:"100%", maxWidth:380}}>
        <div style={{textAlign:"center", marginBottom:28}}>
          <div style={{fontSize:44, marginBottom:12}}>🌿</div>
          <h1 style={{fontFamily:"'Playfair Display',serif", fontSize:28, color:"#7fffd4", marginBottom:8}}>
            Sign in to BreatheOS
          </h1>
          <p style={{fontFamily:"'Cormorant Garamond',serif", fontSize:14, color:"rgba(232,244,240,0.5)", lineHeight:1.6}}>
            Enter your email to receive a magic link. No password needed.
          </p>
        </div>
        {sent ? (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40, marginBottom:12}}>📬</div>
            <p style={{fontFamily:"'Playfair Display',serif", fontSize:20, color:"#e8f4f0", marginBottom:8}}>Check your inbox</p>
            <p style={{fontFamily:"'Cormorant Garamond',serif", fontSize:14, color:"rgba(232,244,240,0.5)"}}>
              We sent a sign-in link to <strong style={{color:"#7fffd4"}}>{email}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com" className="breatheos-input" style={{marginBottom:16}} />
            <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} type="submit"
              disabled={loading} className="breatheos-btn" style={{width:"100%"}}>
              {loading ? "Sending…" : "Send Magic Link"}
            </motion.button>
          </form>
        )}
        <p style={{fontFamily:"'Cormorant Garamond',serif", fontSize:12, color:"rgba(232,244,240,0.3)",
          textAlign:"center", marginTop:20, lineHeight:1.6}}>
          Signing in syncs your data across devices. You can use BreatheOS without signing in too.
        </p>
      </motion.div>
      <style jsx global>{`
        .breatheos-input { background:rgba(127,255,212,0.04); border:1px solid rgba(127,255,212,0.18);
          border-radius:8px; color:#e8f4f0; padding:12px 16px; font-family:'Cormorant Garamond',serif;
          font-size:16px; width:100%; outline:none; box-sizing:border-box; }
        .breatheos-btn { background:linear-gradient(135deg,rgba(15,46,36,0.9),rgba(26,74,56,0.9));
          border:1px solid rgba(127,255,212,0.25); color:#7fffd4; padding:14px 30px; border-radius:8px;
          cursor:pointer; font-family:'Cormorant Garamond',serif; font-size:15px; letter-spacing:2.5px;
          text-transform:uppercase; }
      `}</style>
    </div>
  );
}
