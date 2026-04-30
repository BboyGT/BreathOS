"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSession, signIn, signOut } from "next-auth/react";
import { DayPicker } from "react-day-picker";
import { Command } from "cmdk";
import { createNatureSound, SOUND_PRESETS } from "./nature-sound";
import BpChart from "./bp-chart";
import CreatorSignature from "@/components/CreatorSignature";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// AlertDialog imports removed — exit session now uses a custom AnimatePresence modal
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";

// ─── Zod schema for setup form ────────────────────────────────────
const setupSchema = z.object({
  age: z.string().refine(v => !v || (Number(v) >= 5 && Number(v) <= 120), { message: "Age must be 5–120" }),
  gender: z.enum(["male", "female", "other"]),
  weight: z.string().refine(v => !v || (Number(v) >= 20 && Number(v) <= 300), { message: "Weight must be 20–300 kg" }),
  systolic: z.string().refine(v => !v || (Number(v) >= 70 && Number(v) <= 250), { message: "Systolic must be 70–250" }),
  diastolic: z.string().refine(v => !v || (Number(v) >= 40 && Number(v) <= 150), { message: "Diastolic must be 40–150" }),
});
type SetupForm = z.infer<typeof setupSchema>;

// ─── Types ────────────────────────────────────────────────────────
interface PhaseSet { inhale: number; holdIn: number; exhale: number; holdOut: number; }
interface Program { id: number; range: [number,number]; name: string; emoji: string; desc: string; phases: PhaseSet; altPhases?: PhaseSet[]; technique: string; }
interface PhaseConfig { label: string; color: string; scale: number; easing: string; glow: string; }
interface Recommendation { minutes: number; sessionsPerDay: number; bp: string; notes: string[]; weeks: Array<{week:number;change:number;label:string;color:string}>; maxReduction: number; }
interface Profile { age: string; gender: string; weight: string; systolic: string; diastolic: string; }
interface HistoryEntry { status: string; cyclesCompleted: number; totalCycles: number; }
interface SessionSummary { status: "complete"|"partial"|"missed"; cyclesCompleted: number; totalCycles: number; elapsed: number; trainingDay: number; }
interface PersistedBreatheState {
  profile: Profile; goal: string; rec: Recommendation | null; nature: string; soundOn: boolean;
  sessionSelectedSoundIds: string[]; sessionSoundAutoRotate: boolean; trainingDay: number;
  history: Record<string, HistoryEntry>; bpLog: Array<{date:string;s:number;d:number;day:number}>;
  sleepDuration: number; sleepVolume: number; sleepSelectedSoundIds: string[];
  countCadenceMultiplier: number; safetyConsentAccepted: boolean; guardianConsentAcknowledged: boolean;
  remindersOn: boolean;
}

// ─── Together peer ─────────────────────────────────────────────────
interface Peer { userId: string; phase: string; count: number; }

const STORAGE_KEY = "breatheos:v2";
const CONFIGURED_WS_URL = process.env.NEXT_PUBLIC_WS_URL;
const CROSSFADE_SECONDS = 15;

// ─── Programs ─────────────────────────────────────────────────────
const PROGRAMS: Program[] = [
  { id:1, range:[1,7], name:"Foundation", emoji:"🌱", desc:"Build the habit. Gentle 2:3 ratio activates parasympathetic nervous system.", phases:{inhale:4,holdIn:0,exhale:6,holdOut:0}, altPhases:[{inhale:3,holdIn:0,exhale:5,holdOut:0},{inhale:5,holdIn:0,exhale:7,holdOut:0}], technique:"Diaphragmatic Breathing" },
  { id:2, range:[8,14], name:"Activation", emoji:"🌊", desc:"Extended exhale stimulates the vagus nerve — the key to lowering blood pressure.", phases:{inhale:4,holdIn:2,exhale:8,holdOut:0}, altPhases:[{inhale:3,holdIn:1,exhale:6,holdOut:0},{inhale:5,holdIn:3,exhale:10,holdOut:1}], technique:"Vagal Breathing" },
  { id:3, range:[15,21], name:"Strengthening", emoji:"💪", desc:"Full breath control. Extended exhale at 2:1 ratio begins measurable BP reduction.", phases:{inhale:5,holdIn:3,exhale:10,holdOut:2}, altPhases:[{inhale:4,holdIn:2,exhale:8,holdOut:1},{inhale:6,holdIn:4,exhale:12,holdOut:3}], technique:"Extended Exhale" },
  { id:4, range:[22,35], name:"Capacity", emoji:"🫁", desc:"12-second exhale massively expands lung capacity. Hold training begins.", phases:{inhale:6,holdIn:4,exhale:12,holdOut:3}, altPhases:[{inhale:5,holdIn:3,exhale:10,holdOut:2},{inhale:7,holdIn:5,exhale:14,holdOut:4},{inhale:8,holdIn:6,exhale:16,holdOut:5}], technique:"Lung Expansion" },
  { id:5, range:[36,49], name:"Deep Control", emoji:"⚡", desc:"The 4-7-8 method. Clinical studies show 10–15 mmHg reduction.", phases:{inhale:4,holdIn:7,exhale:8,holdOut:0}, altPhases:[{inhale:3,holdIn:5,exhale:6,holdOut:0},{inhale:5,holdIn:8,exhale:10,holdOut:2}], technique:"4-7-8 Technique" },
  { id:6, range:[50,999], name:"Mastery", emoji:"🌟", desc:"Box breathing — used by Navy SEALs. Maximum cardiovascular benefit.", phases:{inhale:6,holdIn:6,exhale:6,holdOut:6}, altPhases:[{inhale:4,holdIn:4,exhale:4,holdOut:4},{inhale:8,holdIn:8,exhale:8,holdOut:8}], technique:"Box Breathing" },
  { id:7, range:[1,14], name:"Lung Foundation", emoji:"🫁", desc:"Begin expanding lung capacity with progressive inhale stretches.", phases:{inhale:5,holdIn:3,exhale:6,holdOut:1}, altPhases:[{inhale:4,holdIn:2,exhale:5,holdOut:0},{inhale:6,holdIn:4,exhale:7,holdOut:2}], technique:"Capacity Inhale" },
  { id:8, range:[15,35], name:"Breath Hold Builder", emoji:"⏱", desc:"Systematically increase breath-hold. CO2 tolerance training.", phases:{inhale:4,holdIn:8,exhale:6,holdOut:4}, altPhases:[{inhale:3,holdIn:6,exhale:5,holdOut:3},{inhale:5,holdIn:12,exhale:8,holdOut:6}], technique:"CO2 Tolerance" },
  { id:9, range:[36,999], name:"Apnea Training", emoji:"🏊", desc:"Advanced breath-hold training. Push limits safely up to 2+ minutes.", phases:{inhale:3,holdIn:20,exhale:8,holdOut:10}, altPhases:[{inhale:4,holdIn:15,exhale:6,holdOut:8},{inhale:2,holdIn:30,exhale:10,holdOut:12}], technique:"Extended Apnea" },
];
const BP_PROGRAM_IDS = [1,2,3,4,5,6];
const LUNG_PROGRAM_IDS = [7,8,9];
const GOAL_OPTIONS = [
  {
    id: "bp",
    label: "Lower BP",
    icon: "💓",
    detail: "Longer exhales and calmer pacing to support blood-pressure reduction.",
  },
  {
    id: "lung",
    label: "Lung",
    icon: "🫁",
    detail: "Deep inhale work and gradual expansion for breathing capacity.",
  },
  {
    id: "breathhold",
    label: "Breath Hold",
    icon: "⏱",
    detail: "Progressive holds for CO2 tolerance and safer breath-control practice.",
  },
] as const;
function getProgramForDay(day: number, goal = "bp"): Program {
  const pool = goal === "lung" || goal === "breathhold" ? LUNG_PROGRAM_IDS : BP_PROGRAM_IDS;
  const filtered = PROGRAMS.filter(p => pool.includes(p.id));
  return filtered.find(p => day >= p.range[0] && day <= p.range[1]) ?? filtered[filtered.length-1];
}
function getPhasesForCycle(prog: Program, idx: number): PhaseSet {
  const all = [prog.phases, ...(prog.altPhases??[])];
  return all[idx % all.length];
}

// ─── Recommendation engine ────────────────────────────────────────
function getRecommendation({ age, gender, weight, systolic, diastolic }: Profile, goal: string): Recommendation {
  const s = systolic ? parseInt(systolic) : 0;
  const d = diastolic ? parseInt(diastolic) : 0;
  const a = age ? parseInt(age) : 30;
  const w = weight ? parseFloat(weight) : 0;
  let minutes = 10, sessionsPerDay = 2, notes: string[] = [];
  const hasBp = s > 0 && d > 0;
  const bp = !hasBp ? "normal" : s < 120 && d < 80 ? "normal" : s < 130 && d < 80 ? "elevated" : s < 140 || d < 90 ? "high1" : "high2";
  if (goal === "lung") {
    minutes = 12; sessionsPerDay = 2;
    notes.push("Lung capacity mode: focus on deep inhales and extended holds");
    if (a > 50) { minutes += 3; notes.push("Age 50+: gradual progression recommended"); }
  } else if (goal === "breathhold") {
    minutes = 10; sessionsPerDay = 3;
    notes.push("Breath hold mode: building CO2 tolerance progressively");
    notes.push("Never hold breath underwater or while driving");
  } else {
    if (bp === "elevated") { minutes += 5; notes.push("Elevated BP: 15-min sessions recommended"); }
    if (bp === "high1") { minutes += 10; sessionsPerDay = 3; notes.push("Stage 1 Hypertension: 3 sessions daily"); }
    if (bp === "high2") { minutes += 15; sessionsPerDay = 4; notes.push("Stage 2 Hypertension: 4 sessions daily + consult your doctor"); }
    if (a > 60) { minutes += 5; notes.push("Age 60+: longer sessions help vascular flexibility"); }
    if (a < 25) { minutes = Math.max(8, minutes - 2); notes.push("Under 25: high lung adaptability"); }
    if (w > 90) { minutes += 3; notes.push("Higher body mass: extra time aids circulation"); }
    if (gender === "female") { minutes += 2; }
    if (!hasBp) notes.push("No BP data — using general wellness settings.");
  }
  const reduction = bp === "normal" ? 3 : bp === "elevated" ? 8 : bp === "high1" ? 12 : 16;
  const weeks = [
    { week:1, change:0, label:"Stress relief begins", color:"#98fb98" },
    { week:2, change:Math.round(reduction*0.2), label:"Nervous system calming", color:"#7fffd4" },
    { week:4, change:Math.round(reduction*0.5), label:"Measurable BP reduction", color:"#40e0d0" },
    { week:6, change:Math.round(reduction*0.75), label:"Sustained improvement", color:"#20b2aa" },
    { week:8, change:reduction, label:"Full cardiovascular effect", color:"#008b8b" },
    { week:12, change:Math.round(reduction*1.2), label:"Long-term BP management", color:"#006080" },
  ];
  return { minutes: Math.max(5, minutes), sessionsPerDay, bp, notes, weeks, maxReduction: reduction };
}

// ─── Constants & helpers ──────────────────────────────────────────
const PHASE_CONFIG: Record<string, PhaseConfig> = {
  inhale:  { label:"BREATHE IN",   color:"#7fffd4", scale:1.22, easing:"ease", glow:"rgba(127,255,212,0.5)" },
  holdIn:  { label:"HOLD",         color:"#ffd700", scale:1.22, easing:"linear", glow:"rgba(255,215,0,0.5)" },
  exhale:  { label:"BREATHE OUT",  color:"#87ceeb", scale:0.82, easing:"ease", glow:"rgba(135,206,235,0.3)" },
  holdOut: { label:"HOLD EMPTY",   color:"#c084fc", scale:0.82, easing:"linear", glow:"rgba(192,132,252,0.3)" },
  rest:    { label:"GET READY",    color:"#98fb98", scale:1.0,  easing:"ease", glow:"rgba(152,251,152,0.2)" },
};
const SLEEP_DURATIONS = [
  {label:"30m",value:30*60},{label:"1h",value:60*60},{label:"2h",value:2*60*60},
  {label:"4h",value:4*60*60},{label:"6h",value:6*60*60},{label:"8h",value:8*60*60},
  {label:"12h",value:12*60*60},{label:"All Night",value:0},
];
const REMINDER_MESSAGES = [
  { title:"Time to Breathe 🌿", body:"Take 2 minutes right now. Inhale for 4, exhale for 6." },
  { title:"Breathe Break 💚", body:"5 deep breaths can lower stress hormones by 25%." },
  { title:"Your Heart Needs This 💓", body:"One breathing session keeps your blood pressure on track." },
  { title:"Stay Consistent 🔥", body:"Day {day} and counting! Consistency builds cardiovascular resilience." },
  { title:"Quick Reset ⚡", body:"Box breathing: 4 in, 4 hold, 4 out, 4 hold. Repeat 4 times." },
  { title:"Vagus Nerve Glow ✨", body:"Slow breathing stimulates your vagus nerve — your body's built-in calm switch." },
  { title:"Evening Calm 🍃", body:"Wind down with slow breathing tonight. Better sleep starts here." },
];
const dateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = () => dateKey();
const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const getTogetherWsUrl = () => {
  if (CONFIGURED_WS_URL) return CONFIGURED_WS_URL;
  if (typeof window === "undefined") return "ws://localhost:4001";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname || "localhost"}:4001`;
};

// ─── Motion variants ──────────────────────────────────────────────
const SPRING = { stiffness: 300, damping: 30 } as const;
const PAGE_EASE = [0.32, 0.72, 0, 1] as const;
// FIX 2: faster page transitions — 0.25s in / 0.18s out, 8px Y travel only.
// Removed filter:blur — it’s GPU-expensive and left stale stacking contexts.
const EXIT_EASE = [0.4, 0, 1, 1] as const;
const pageVariants = {
  initial: { opacity:0, y:8 },
  animate: { opacity:1, y:0, transition:{ duration:0.25, ease:PAGE_EASE } },
  exit:    { opacity:0, y:-4, transition:{ duration:0.18, ease:EXIT_EASE } },
};
const staggerContainer = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeInUp = { initial:{ opacity:0, y:16 }, animate:{ opacity:1, y:0, transition:{ duration:0.4, ease:"easeOut" as const } } };
const scaleIn  = { initial:{ opacity:0, scale:0.9 }, animate:{ opacity:1, scale:1, transition:{ duration:0.3 } } };

// ─── BottomNav (outside component to prevent remount on every render) ───────
interface BottomNavProps {
  screen: string;
  sleepPlaying: boolean;
  stopSleepSounds: () => void;
  setScreen: (s: string) => void;
}
function BottomNav({ screen, sleepPlaying, stopSleepSounds, setScreen }: BottomNavProps) {
  const NAV = [["dashboard","🏠","Home"],["sleep","😴","Sleep"],["calendar","📅","History"],["bp","📊","BP"],["setup","⚙️","Profile"]] as const;
  return (
    // FIX 4: constrain the nav to the 520px content column by centering with
    // left:50%/translateX(-50%) instead of left:0/right:0. This prevents the
    // nav from spanning the full browser viewport on wide mobile screens.
    // border-radius on top corners lets it sit cleanly inside the column.
    <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", zIndex:50, background:"rgba(3,11,20,0.97)", borderTop:"1px solid rgba(127,255,212,0.08)", backdropFilter:"blur(20px)", display:"flex", justifyContent:"space-around", alignItems:"stretch", padding:"8px 0 max(8px,env(safe-area-inset-bottom))", width:"100%", maxWidth:520, borderRadius:"12px 12px 0 0" }}>
      {NAV.map(([s,icon,label]) => {
        const active = screen === s;
        return (
          <button key={s} onClick={() => { if (sleepPlaying && s !== "sleep") stopSleepSounds(); setScreen(s); }}
            style={{ background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, flex:1, padding:"4px 2px", minWidth:0 }}>
            <span style={{ fontSize:18, lineHeight:1, filter: active ? "drop-shadow(0 0 5px rgba(127,255,212,0.8))" : "none", transition:"filter 0.2s" }}>{icon}</span>
            <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:9, letterSpacing:1, color: active ? "#7fffd4" : "rgba(232,244,240,0.3)", textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:52, transition:"color 0.2s" }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
// ─── SidebarNav (desktop ≥1200px) ───────────────────────────────────
interface SidebarNavProps { screen: string; sleepPlaying: boolean; stopSleepSounds: () => void; setScreen: (s: string) => void; trainingDay: number; history: Record<string, HistoryEntry>; rec: Recommendation | null; }
function SidebarNav({ screen, sleepPlaying, stopSleepSounds, setScreen, trainingDay, history, rec }: SidebarNavProps) {
  const NAV = [["dashboard","Home","⌂"],["sleep","Sleep","🌙"],["calendar","History","📅"],["bp","BP Tracker","📊"],["setup","Profile","⚙️"]] as const;
  // Today’s session status
  const todayKey = today();
  const todayEntry = history[todayKey];
  const todayStatus = todayEntry?.status ?? null;
  const statusDot: Record<string,string> = { complete:"#7fffd4", partial:"#fbbf24", missed:"#f87171" };
  return (
    <div style={{ position:"fixed", top:0, left:0, bottom:0, width:200, zIndex:40, background:"rgba(3,11,20,0.95)", borderRight:"1px solid rgba(127,255,212,0.07)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", display:"flex", flexDirection:"column", padding:"32px 16px" }}>
      <div style={{ marginBottom:40, paddingLeft:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          <span style={{ fontSize:20, filter:"drop-shadow(0 0 8px rgba(127,255,212,0.7))" }}>🌿</span>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:"#7fffd4", fontWeight:400 }}>BreatheOS</span>
        </div>
        <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:10, color:"rgba(127,255,212,0.3)", letterSpacing:2.5, textTransform:"uppercase", paddingLeft:30 }}>Cardiovascular</p>
      </div>
      <nav style={{ display:"flex", flexDirection:"column", gap:4 }}>
        {NAV.map(([s, label, icon]) => {
          const active = screen === s;
          return (
            <motion.button key={s}
              whileHover={{ x:4 }}
              transition={SPRING}
              onClick={() => { if (sleepPlaying && s !== "sleep") stopSleepSounds(); setScreen(s); }}
              style={{ background:active?"rgba(127,255,212,0.08)":"transparent", border:active?"1px solid rgba(127,255,212,0.15)":"1px solid transparent", borderRadius:10, padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, textAlign:"left", transition:"all 0.2s" }}>
              <span style={{ fontSize:16, lineHeight:1, filter:active?"drop-shadow(0 0 5px rgba(127,255,212,0.8))":"none", transition:"filter 0.2s" }}>{icon}</span>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:1.5, color:active?"#7fffd4":"rgba(232,244,240,0.35)", textTransform:"uppercase", transition:"color 0.2s" }}>{label}</span>
              {active && <div style={{ marginLeft:"auto", width:3, height:3, borderRadius:"50%", background:"#7fffd4", boxShadow:"0 0 6px #7fffd4" }} />}
            </motion.button>
          );
        })}
      </nav>

      {/* FIX 3: Today’s Stats mini-widget — fills empty sidebar space.
          Only visible on desktop, only when the user has a plan (rec exists). */}
      {rec && (
        <div style={{ margin:"20px 0", padding:"14px 16px", background:"rgba(127,255,212,0.02)", border:"1px solid rgba(127,255,212,0.07)", borderRadius:12 }}>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:9, color:"rgba(127,255,212,0.3)", letterSpacing:2.5, textTransform:"uppercase", marginBottom:12 }}>Today</p>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:12 }}>
            <div>
              <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:9, color:"rgba(127,255,212,0.25)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:3 }}>Day</p>
              <p style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:"#7fffd4", lineHeight:1 }}>{trainingDay}</p>
            </div>
            <div style={{ textAlign:"right" }}>
              <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:9, color:"rgba(127,255,212,0.25)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:3 }}>Status</p>
              {todayStatus ? (
                <div style={{ display:"flex", alignItems:"center", gap:5, justifyContent:"flex-end" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:statusDot[todayStatus] ?? "rgba(232,244,240,0.3)", boxShadow:`0 0 6px ${statusDot[todayStatus] ?? "transparent"}` }} />
                  <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:11, color:statusDot[todayStatus] ?? "rgba(232,244,240,0.35)", letterSpacing:0.5 }}>{todayStatus[0].toUpperCase()+todayStatus.slice(1)}</span>
                </div>
              ) : (
                <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:11, color:"rgba(232,244,240,0.2)" }}>—</span>
              )}
            </div>
          </div>
          {/* 84-day progress bar */}
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:9, color:"rgba(127,255,212,0.25)", letterSpacing:1.5, textTransform:"uppercase" }}>Program</p>
              <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:9, color:"rgba(127,255,212,0.4)" }}>{Math.round(Math.min(100,(trainingDay/84)*100))}%</p>
            </div>
            <div style={{ height:2, background:"rgba(127,255,212,0.06)", borderRadius:1, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.min(100,(trainingDay/84)*100)}%`, background:"linear-gradient(90deg,rgba(127,255,212,0.3),#7fffd4)", borderRadius:1, transition:"width 0.6s ease" }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop:"auto", paddingLeft:8 }}>
        <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:10, color:"rgba(127,255,212,0.2)", letterSpacing:2, textTransform:"uppercase" }}>© {new Date().getFullYear()} BreatheOS</p>
      </div>
    </div>
  );
}

function FloatingParticles() {
  const particles = useMemo(() => Array.from({length:20}).map((_,i) => ({
    id:i, left:`${Math.random()*100}%`, delay:`${Math.random()*8}s`,
    duration:`${6+Math.random()*8}s`, size:1+Math.random()*2.5, opacity:0.1+Math.random()*0.25,
  })),[]);
  return (
    <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
      {particles.map(p => (
        <div key={p.id} style={{ position:"absolute", bottom:-10, left:p.left, width:p.size, height:p.size,
          borderRadius:"50%", background:"#7fffd4", opacity:p.opacity,
          animation:`particleFloat ${p.duration} ${p.delay} linear infinite` }} />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function BreatheOS() {
  const { data: authSession } = useSession();
  const [screen, setScreen] = useState("intro");
  const [introStep, setIntroStep] = useState(0);
  const [postIntroScreen, setPostIntroScreen] = useState("welcome");
  const [hydrated, setHydrated] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Responsive layout detection
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1200);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Setup form with zod validation
  const { register, handleSubmit, formState:{ errors }, setValue } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { age:"", gender:"male", weight:"", systolic:"", diastolic:"" },
  });

  // Core state
  const [profile, setProfile] = useState<Profile>({ age:"", gender:"male", weight:"", systolic:"", diastolic:"" });
  const [goal, setGoal] = useState("bp");
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [nature, setNature] = useState("Ocean Waves");
  const [soundOn, setSoundOn] = useState(true);
   const [sessionSelectedSoundIds, setSessionSelectedSoundIds] = useState<string[]>(["Ocean Waves"]);
   const [sessionSoundAutoRotate, setSessionSoundAutoRotate] = useState(true);
   const [setupSoundCategory, setSetupSoundCategory] = useState("All");
   const [trainingDay, setTrainingDay] = useState(1);

  // Session state
  const [phase, setPhase] = useState("rest");
  const [count, setCount] = useState(0);
  const [cycleNum, setCycleNum] = useState(0);
  const [totalCycles, setTotalCycles] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const elapsedValueRef = useRef(0); // tracks current elapsed without stale closure
   const [sessionStarted, setSessionStarted] = useState(false);
   const [sessionActive, setSessionActive] = useState(false);
   const [showExitSessionPrompt, setShowExitSessionPrompt] = useState(false);
  const [lastSessionSummary, setLastSessionSummary] = useState<SessionSummary|null>(null);
  const [safetyConsentAccepted, setSafetyConsentAccepted] = useState(false);
  const [guardianConsentAcknowledged, setGuardianConsentAcknowledged] = useState(false);
  const [currentCyclePhases, setCurrentCyclePhases] = useState<PhaseSet>({inhale:0,holdIn:0,exhale:0,holdOut:0});

  // Circle animation
  const [circleScale, setCircleScale] = useState(1.0);
  const [circleTransDur, setCircleTransDur] = useState(1);
  const [circleEasing, setCircleEasing] = useState<[number,number,number,number]>([0.25,0.1,0.25,1]);
  const [circleGlow, setCircleGlow] = useState("rgba(152,251,152,0.2)");
  const [circleColor, setCircleColor] = useState("#98fb98");
  const [holdPulseActive, setHoldPulseActive] = useState(false);

  // Calendar
  const [history, setHistory] = useState<Record<string, HistoryEntry>>({});
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);

  // BP tracking
  const [bpLog, setBpLog] = useState<Array<{date:string;s:number;d:number;day:number}>>([]);
  const [showBpModal, setShowBpModal] = useState(false);
  const [newBp, setNewBp] = useState({ s:"", d:"" });

  // Sleep
  const [sleepPlaying, setSleepPlaying] = useState(false);
  const [sleepDuration, setSleepDuration] = useState(0);
  const [sleepVolume, setSleepVolume] = useState(0.7);
  const [sleepSelectedSoundIds, setSleepSelectedSoundIds] = useState<string[]>([]);
  const [sleepElapsed, setSleepElapsed] = useState(0);
  const [sleepCurrentSound, setSleepCurrentSound] = useState("");
  const [sleepNextSound, setSleepNextSound] = useState("");
  const [sleepCrossfadeProgress, setSleepCrossfadeProgress] = useState(0);
  const [sleepError, setSleepError] = useState("");

  // Reminders
  const [remindersOn, setRemindersOn] = useState(false);
  const [reminderPermission, setReminderPermission] = useState<NotificationPermission>("default");
  const [lastReminder, setLastReminder] = useState("");

  // Settings
  const [countCadenceMultiplier, setCountCadenceMultiplier] = useState(1.25);

  // cmdk sound search
  const [soundSearchOpen, setSoundSearchOpen] = useState(false);
  const [soundSearchTarget, setSoundSearchTarget] = useState<"session"|"sleep">("session");

  // Breathe Together (WebSocket)
  const [togetherRoomId, setTogetherRoomId] = useState("");
  const [togetherRoomInput, setTogetherRoomInput] = useState("");
  const [togetherConnected, setTogetherConnected] = useState(false);
  const [togetherConnecting, setTogetherConnecting] = useState(false);
  const [togetherError, setTogetherError] = useState("");
  const [togetherPeers, setTogetherPeers] = useState<Peer[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const togetherConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myUserId = useMemo(() => Math.random().toString(36).slice(2,10), []);

  // Audio refs
  const audioCtxRef = useRef<AudioContext|null>(null);
  const soundRef = useRef<ReturnType<typeof createNatureSound>|null>(null);
  const sessionSoundTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const sessionSoundQueueRef = useRef<string[]>([]);
  const sessionSoundIndexRef = useRef(0);
   const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
   const elapsedRef = useRef<ReturnType<typeof setInterval>|null>(null);
   const cycleRef = useRef<{cycleIdx: number}>({ cycleIdx: 0 });
   const sessionDateRef = useRef(today());
  const reminderTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Sleep audio refs
  const sleepAudioRef = useRef<AudioContext|null>(null);
  const sleepMasterRef = useRef<GainNode|null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const sleepCurrentRef = useRef<{sound:ReturnType<typeof createNatureSound>;gain:GainNode}|null>(null);
  const sleepNextRef = useRef<{sound:ReturnType<typeof createNatureSound>;gain:GainNode}|null>(null);
  const sleepQueueRef = useRef<string[]>([]);
  const sleepQueueIdxRef = useRef(0);
  const sleepSoundTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const sleepFadeIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const sleepScrollRef = useRef<HTMLDivElement|null>(null);
  // FIX: removed duplicate `const CROSSFADE_SECONDS = 15` that was declared
  // here inside the component, shadowing the module-level constant (line 54).
  // The inner declaration caused crossfadeToNext's useCallback to list
  // CROSSFADE_SECONDS as a reactive dep (a number literal is stable — no need).
  // Using the module-level constant directly fixes the ESLint warning.

  // ─── Derived memos ────────────────────────────────────────────────
  const setupSoundCategories = useMemo(() => ["All", ...new Set(SOUND_PRESETS.map(p => p.category))], []);
  const filteredSetupSounds = useMemo(() =>
    setupSoundCategory === "All" ? SOUND_PRESETS : SOUND_PRESETS.filter(p => p.category === setupSoundCategory),
    [setupSoundCategory]);
  const sessionSelectedSounds = useMemo(() => SOUND_PRESETS.filter(p => sessionSelectedSoundIds.includes(p.id)), [sessionSelectedSoundIds]);
  const SLEEP_CATEGORIES = useMemo(() => {
    const cats = [...new Set(SOUND_PRESETS.map(p => p.category))];
    return cats.map(cat => {
      const presets = SOUND_PRESETS.filter(p => p.category === cat);
      return { name: cat, emoji: presets[0]?.emoji ?? "", sounds: presets.map(p => p.id) };
    });
  }, []);
  const DEFAULT_SLEEP_SOUND_IDS = useMemo(() =>
    SOUND_PRESETS.filter(p => ["Rain","Water"].includes(p.category)).map(p => p.id), []);
  const sleepSelectedSounds = useMemo(() => sleepSelectedSoundIds, [sleepSelectedSoundIds]);
  const sleepSelectedPresets = useMemo(() => SOUND_PRESETS.filter(p => sleepSelectedSoundIds.includes(p.id)), [sleepSelectedSoundIds]);
  const activeSleepCategories = useMemo(() =>
    SLEEP_CATEGORIES.filter(c => c.sounds.some(id => sleepSelectedSounds.includes(id))).map(c => c.name),
    [SLEEP_CATEGORIES, sleepSelectedSounds]);
  const sleepSoundDurationSec = useMemo(() => {
    const total = sleepDuration > 0 ? sleepDuration : 12*60*60;
    return Math.max(CROSSFADE_SECONDS*2, Math.floor(total / Math.max(1, sleepSelectedSoundIds.length)));
  }, [sleepDuration, sleepSelectedSoundIds.length]);
  const sleepTimeRemaining = sleepDuration > 0 ? Math.max(0, sleepDuration - sleepElapsed) : Math.max(0, 12*60*60 - sleepElapsed);
  const latestBp = bpLog.length > 0 ? bpLog[bpLog.length-1] : null;
  const prog = getProgramForDay(trainingDay, goal);
  const pc = PHASE_CONFIG[phase] ?? PHASE_CONFIG.rest;
  const sessionProgress = totalCycles > 0 ? (cycleNum / totalCycles) * 100 : 0;
  const statusColor: Record<string,string> = { complete:"#7fffd4", partial:"#fbbf24", missed:"#f87171", future:"rgba(127,255,212,0.08)" };

  // ─── Persist / hydrate ───────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedBreatheState>;
        if (saved.profile) { setProfile(saved.profile); Object.entries(saved.profile).forEach(([k,v]) => setValue(k as keyof SetupForm, v as string)); }
        if (saved.goal) setGoal(saved.goal);
        if (saved.nature) setNature(saved.nature);
        if (typeof saved.soundOn === "boolean") setSoundOn(saved.soundOn);
        if (Array.isArray(saved.sessionSelectedSoundIds) && saved.sessionSelectedSoundIds.length > 0) setSessionSelectedSoundIds(saved.sessionSelectedSoundIds);
        if (typeof saved.sessionSoundAutoRotate === "boolean") setSessionSoundAutoRotate(saved.sessionSoundAutoRotate);
        if (typeof saved.trainingDay === "number") setTrainingDay(saved.trainingDay);
        if (saved.history) setHistory(saved.history);
        if (Array.isArray(saved.bpLog)) setBpLog(saved.bpLog);
        if (typeof saved.sleepDuration === "number") setSleepDuration(saved.sleepDuration);
        if (typeof saved.sleepVolume === "number") setSleepVolume(saved.sleepVolume);
        if (Array.isArray(saved.sleepSelectedSoundIds) && saved.sleepSelectedSoundIds.length > 0) setSleepSelectedSoundIds(saved.sleepSelectedSoundIds);
        else setSleepSelectedSoundIds(DEFAULT_SLEEP_SOUND_IDS);
        if (typeof saved.countCadenceMultiplier === "number") setCountCadenceMultiplier(saved.countCadenceMultiplier);
        if (typeof saved.safetyConsentAccepted === "boolean") setSafetyConsentAccepted(saved.safetyConsentAccepted);
        if (typeof saved.guardianConsentAcknowledged === "boolean") setGuardianConsentAcknowledged(saved.guardianConsentAcknowledged);
        if (typeof saved.remindersOn === "boolean") setRemindersOn(saved.remindersOn);
        if (saved.rec) { setRec(saved.rec); setPostIntroScreen("dashboard"); }
      } else { setSleepSelectedSoundIds(DEFAULT_SLEEP_SOUND_IDS); }
    } catch { setSleepSelectedSoundIds(DEFAULT_SLEEP_SOUND_IDS); }
    finally { setHydrated(true); }
  }, [DEFAULT_SLEEP_SOUND_IDS, setValue]);

  // ── Intro — plays every launch ───────────────────────────────────
  useEffect(() => {
    if (screen !== "intro") return;
    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => setIntroStep(1), 600));   // dot breathes in
    t.push(setTimeout(() => setIntroStep(2), 2000));  // rings expand
    t.push(setTimeout(() => setIntroStep(3), 3400));  // logo appears
    t.push(setTimeout(() => setIntroStep(4), 4800));  // title rises
    t.push(setTimeout(() => setIntroStep(5), 6200));  // tagline + tap prompt
    t.push(setTimeout(() => { setScreen(postIntroScreen); setIntroStep(0); }, 9000));
    return () => t.forEach(clearTimeout);
  }, [screen, postIntroScreen]);

  // ── Notification permission ───────────────────────────────────────
  useEffect(() => { if ("Notification" in window) setReminderPermission(Notification.permission); }, []);

  // ── Server sync when signed in ────────────────────────────────────
  useEffect(() => {
    if (!authSession?.user?.id || !hydrated) return;
    fetch("/api/user", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: { goal, trainingDay, soundOn, sessionSoundIds: JSON.stringify(sessionSelectedSoundIds), sessionSoundAutoRotate, countCadenceMultiplier, sleepDuration, sleepVolume, sleepSoundIds: JSON.stringify(sleepSelectedSoundIds), remindersOn, safetyConsentAccepted, guardianConsentAcknowledged, ...profile },
        bpLogs: bpLog.map(b => ({ date: b.date, systolic: b.s, diastolic: b.d, day: b.day })) }) }).catch(() => {});
   }, [authSession?.user?.id, trainingDay, bpLog.length]);

  // ── Persist to localStorage ───────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedBreatheState = { profile, goal, rec, nature, soundOn, sessionSelectedSoundIds, sessionSoundAutoRotate, trainingDay, history, bpLog, sleepDuration, sleepVolume, sleepSelectedSoundIds, countCadenceMultiplier, safetyConsentAccepted, guardianConsentAcknowledged, remindersOn };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, profile, goal, rec, nature, soundOn, sessionSelectedSoundIds, sessionSoundAutoRotate, trainingDay, history, bpLog, sleepDuration, sleepVolume, sleepSelectedSoundIds, countCadenceMultiplier, safetyConsentAccepted, guardianConsentAcknowledged, remindersOn]);

  // ── Reminders ─────────────────────────────────────────────────────
  const scheduleNextReminder = useCallback(() => {
    const delay = 25*60*1000 + Math.random()*(3*60*60*1000 - 25*60*1000);
    clearTimeout(reminderTimerRef.current!);
    reminderTimerRef.current = setTimeout(() => {
      if (!remindersOn || Notification.permission !== "granted") return;
      const msg = REMINDER_MESSAGES[Math.floor(Math.random()*REMINDER_MESSAGES.length)];
      try { new Notification(msg.title, { body: msg.body.replace("{day}", String(trainingDay)), icon:"/icons/icon.svg", tag:"breatheos-reminder" }); } catch {}
      setLastReminder(new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }));
      scheduleNextReminder();
    }, delay);
  }, [remindersOn, trainingDay]);

  useEffect(() => {
    if (remindersOn && reminderPermission === "granted") scheduleNextReminder();
    return () => clearTimeout(reminderTimerRef.current!);
  }, [remindersOn, reminderPermission, scheduleNextReminder]);

  const toggleReminders = useCallback(async () => {
    if (!remindersOn) {
      if (!("Notification" in window)) return;
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      setReminderPermission(perm);
      setRemindersOn(true);
    } else {
      clearTimeout(reminderTimerRef.current!);
      setRemindersOn(false);
    }
  }, [remindersOn]);

  // ── Sound engine ──────────────────────────────────────────────────
  const stopSound = useCallback(() => {
    clearInterval(sessionSoundTimerRef.current!); sessionSoundTimerRef.current = null;
    if (soundRef.current) { soundRef.current.stop(); soundRef.current = null; }
  }, []);

  const playSessionSound = useCallback((soundId: string) => {
    if (!soundOn) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    stopSound();
    soundRef.current = createNatureSound(ctx, soundId);
    setNature(soundId);
  }, [soundOn, stopSound]);

  const startSound = useCallback(() => {
    const sounds = sessionSelectedSoundIds.length > 0 ? sessionSelectedSoundIds : [nature];
    const totalSec = Math.max(60, (rec?.minutes ?? 1) * 60);
    const rotateSec = Math.max(20, Math.floor(totalSec / Math.max(1, sounds.length)));
    sessionSoundQueueRef.current = [...sounds];
    sessionSoundIndexRef.current = 0;
    playSessionSound(sounds[0]);
    if (sessionSoundAutoRotate && sounds.length > 1) {
      sessionSoundTimerRef.current = setInterval(() => {
        const q = sessionSoundQueueRef.current;
        if (q.length <= 1) return;
        sessionSoundIndexRef.current = (sessionSoundIndexRef.current + 1) % q.length;
        playSessionSound(q[sessionSoundIndexRef.current]);
      }, rotateSec * 1000);
    }
  }, [sessionSelectedSoundIds, nature, rec?.minutes, sessionSoundAutoRotate, playSessionSound]);

  // ── Sleep sound engine ────────────────────────────────────────────
  const stopSleepSounds = useCallback(() => {
    clearInterval(sleepTimerRef.current!); sleepTimerRef.current = null;
    clearInterval(sleepSoundTimerRef.current!); sleepSoundTimerRef.current = null;
    clearInterval(sleepFadeIntervalRef.current!); sleepFadeIntervalRef.current = null;
    if (sleepCurrentRef.current) { try { sleepCurrentRef.current.sound.stop(); } catch {} sleepCurrentRef.current.gain.disconnect(); sleepCurrentRef.current = null; }
    if (sleepNextRef.current) { try { sleepNextRef.current.sound.stop(); } catch {} sleepNextRef.current.gain.disconnect(); sleepNextRef.current = null; }
    if (sleepMasterRef.current) { sleepMasterRef.current.disconnect(); sleepMasterRef.current = null; }
    if (sleepAudioRef.current && sleepAudioRef.current.state !== "closed") { sleepAudioRef.current.close(); sleepAudioRef.current = null; }
    setSleepPlaying(false); setSleepElapsed(0); setSleepCurrentSound(""); setSleepNextSound(""); setSleepCrossfadeProgress(0);
  }, []);

  const crossfadeToNext = useCallback(() => {
    const ctx = sleepAudioRef.current; const master = sleepMasterRef.current;
    if (!ctx || !master) return;
    const queue = sleepQueueRef.current; if (!queue.length) return;
    const nextIdx = (sleepQueueIdxRef.current + 1) % queue.length;
    const nextName = queue[nextIdx];
    const nextPreset = SOUND_PRESETS.find(p => p.id === nextName);
    const nextGain = ctx.createGain(); nextGain.gain.value = 0; nextGain.connect(master);
    const nextSound = createNatureSound(ctx, nextName);
    nextSound.master.disconnect(); nextSound.master.connect(nextGain);
    sleepNextRef.current = { sound: nextSound, gain: nextGain };
    setSleepNextSound(nextPreset?.name ?? nextName); setSleepCrossfadeProgress(0);
    let step = 0;
    clearInterval(sleepFadeIntervalRef.current!);
    sleepFadeIntervalRef.current = setInterval(() => {
      step++; const p = step / CROSSFADE_SECONDS; const now = ctx.currentTime + 0.05;
      if (sleepCurrentRef.current) sleepCurrentRef.current.gain.gain.setTargetAtTime(1 - p, now, 0.1);
      nextGain.gain.setTargetAtTime(p, now, 0.1);
      setSleepCrossfadeProgress(Math.round(p * 100));
      if (step >= CROSSFADE_SECONDS) {
        clearInterval(sleepFadeIntervalRef.current!); sleepFadeIntervalRef.current = null;
        if (sleepCurrentRef.current) { sleepCurrentRef.current.sound.stop(); sleepCurrentRef.current.gain.disconnect(); }
        sleepCurrentRef.current = { sound: nextSound, gain: nextGain };
        sleepNextRef.current = null; sleepQueueIdxRef.current = nextIdx;
        setSleepCurrentSound(nextPreset?.name ?? nextName); setSleepNextSound(""); setSleepCrossfadeProgress(0);
      }
    }, 1000);
  }, [CROSSFADE_SECONDS]);

  const buildQueue = useCallback(() => {
    const arr = [...sleepSelectedSounds];
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }, [sleepSelectedSounds]);

  const startSleepSounds = useCallback(() => {
    stopSleepSounds();
    setSleepError("");
    if (!sleepSelectedSounds.length) {
      setSleepError("Choose at least one sound category before starting sleep sounds.");
      return;
    }
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ctx.state === "suspended") void ctx.resume();
      sleepAudioRef.current = ctx;
      const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); sleepMasterRef.current = master;
      const queue = buildQueue(); sleepQueueRef.current = queue; sleepQueueIdxRef.current = 0;
      const firstName = queue[0]; const firstPreset = SOUND_PRESETS.find(p => p.id === firstName);
      const firstGain = ctx.createGain(); firstGain.gain.value = 1; firstGain.connect(master);
      const firstSound = createNatureSound(ctx, firstName); firstSound.master.disconnect(); firstSound.master.connect(firstGain);
      sleepCurrentRef.current = { sound: firstSound, gain: firstGain };
      setSleepCurrentSound(firstPreset?.name ?? firstName);
      master.gain.setTargetAtTime(sleepVolume, ctx.currentTime, 1.5);
      const totalSec = sleepDuration > 0 ? sleepDuration : 12*60*60;
      let soundElapsed = 0;
      setSleepPlaying(true); setSleepElapsed(0);
      sleepTimerRef.current = setInterval(() => {
        setSleepElapsed(e => {
          const next = e + 1;
          if (next >= totalSec) { master.gain.setTargetAtTime(0, ctx.currentTime + 0.05, 1.5); setTimeout(() => stopSleepSounds(), 5000); return totalSec; }
          return next;
        });
      }, 1000);
      sleepSoundTimerRef.current = setInterval(() => {
        soundElapsed++;
        if (soundElapsed >= sleepSoundDurationSec) { soundElapsed = 0; crossfadeToNext(); }
      }, 1000);
    } catch (err) {
      stopSleepSounds();
      setSleepError(err instanceof Error ? `Could not start sleep sounds: ${err.message}` : "Could not start sleep sounds on this device.");
    }
  }, [sleepSelectedSounds, sleepDuration, sleepVolume, stopSleepSounds, buildQueue, crossfadeToNext, sleepSoundDurationSec]);

  useEffect(() => {
    if (sleepMasterRef.current && sleepAudioRef.current && sleepPlaying) sleepMasterRef.current.gain.setTargetAtTime(sleepVolume, sleepAudioRef.current.currentTime, 0.3);
  }, [sleepVolume, sleepPlaying]);

  useEffect(() => {
    if (screen === "sleep") sleepScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [screen, sleepPlaying]);

  useEffect(() => () => stopSleepSounds(), [stopSleepSounds]);

  // ── Session engine ────────────────────────────────────────────────
  const animatePhase = useCallback((ph: string, dur: number) => {
    const cfg = PHASE_CONFIG[ph] ?? PHASE_CONFIG.rest;
    setCircleColor(cfg.color); setCircleGlow(cfg.glow);
    if (ph === "holdIn" || ph === "holdOut") { setCircleTransDur(0.3); setCircleEasing([0.25,0.1,0.25,1]); setCircleScale(cfg.scale); setHoldPulseActive(true); }
    else { setCircleTransDur(dur); setCircleEasing([0.25,0.1,0.25,1]); setCircleScale(cfg.scale); setHoldPulseActive(false); }
  }, []);

  const runPhase = useCallback((ph: string, dur: number, onDone: () => void) => {
    clearInterval(timerRef.current!);
    setPhase(ph); animatePhase(ph, dur * countCadenceMultiplier);
    let remaining = dur; setCount(remaining);
    if (dur === 0) { onDone(); return; }
    timerRef.current = setInterval(() => {
      remaining -= 1; setCount(remaining);
      if (remaining <= 0) { clearInterval(timerRef.current!); onDone(); }
    }, 1000 * countCadenceMultiplier);
  }, [animatePhase, countCadenceMultiplier]);

  const cleanupActiveSession = useCallback(() => {
    clearInterval(timerRef.current!); clearInterval(elapsedRef.current!);
    stopSound(); setSessionActive(false); setPhase("rest"); setShowExitSessionPrompt(false); animatePhase("rest", 1);
  }, [stopSound, animatePhase]);

  const endSession = useCallback((completedCycles: number, total: number) => {
    cleanupActiveSession();
    const dateKey = sessionDateRef.current;
    const pct = total > 0 ? completedCycles / total : 0;
    const status: SessionSummary["status"] = pct >= 0.9 ? "complete" : pct >= 0.4 ? "partial" : "missed";
    setHistory(h => ({ ...h, [dateKey]: { status, cyclesCompleted: completedCycles, totalCycles: total } }));
    setLastSessionSummary({ status, cyclesCompleted: completedCycles, totalCycles: total, elapsed, trainingDay });
    setTrainingDay(d => d + (status === "complete" ? 1 : 0));
    if ((trainingDay + (status === "complete" ? 1 : 0)) % 14 === 0) setShowBpModal(true);
    setScreen("stats");
    if (authSession?.user?.id) {
      fetch("/api/user", { method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ breathSessions: [{ date: dateKey, status, cyclesCompleted: completedCycles, totalCycles: total, elapsed, trainingDay }] }) }).catch(() => {});
    }
  }, [cleanupActiveSession, elapsed, trainingDay, authSession?.user?.id]);

  const runPhaseRef = useRef(runPhase); const endSessionRef = useRef(endSession);
  const startCycleRef = useRef<(ci: number, mc: number, pr: Program) => void>(() => {});
  // FIX: added dependency arrays to the three ref-update effects.
  // Without deps they ran on every render; with deps they only fire when the
  // underlying callback changes (which is the correct "useLatest" pattern).
  useEffect(() => { runPhaseRef.current = runPhase; }, [runPhase]);
  useEffect(() => { endSessionRef.current = endSession; }, [endSession]);

  const startCycle = (cycleIdx: number, maxCycles: number, pr: Program) => {
    if (cycleIdx >= maxCycles) { endSessionRef.current(cycleIdx, maxCycles); return; }
    setCycleNum(cycleIdx + 1); cycleRef.current.cycleIdx = cycleIdx;
    const p = getPhasesForCycle(pr, cycleIdx); setCurrentCyclePhases(p);
    const advance = () => startCycle(cycleIdx + 1, maxCycles, pr);
    const afterHoldOut = () => advance();
    const afterExhale = () => p.holdOut > 0 ? runPhaseRef.current("holdOut", p.holdOut, afterHoldOut) : afterHoldOut();
    const afterHoldIn = () => runPhaseRef.current("exhale", p.exhale, afterExhale);
    const afterInhale = () => p.holdIn > 0 ? runPhaseRef.current("holdIn", p.holdIn, afterHoldIn) : afterHoldIn();
    runPhaseRef.current("inhale", p.inhale, afterInhale);
  };
   useEffect(() => { startCycleRef.current = startCycle; }, [startCycle]);

  const startSession = useCallback(() => {
    if (!rec || !safetyConsentAccepted || !guardianConsentAcknowledged) { setScreen("setup"); return; }
    const pr = getProgramForDay(trainingDay, goal);
    const allPhases = [pr.phases, ...(pr.altPhases ?? [])];
    const avgCycle = (allPhases.reduce((s, p) => s + p.inhale + p.holdIn + p.exhale + p.holdOut, 0) / allPhases.length) * countCadenceMultiplier;
    const total = Math.max(4, Math.floor((rec.minutes * 60) / avgCycle));
    setTotalCycles(total); setCycleNum(0); setElapsed(0);
    setSessionActive(true); setSessionStarted(true); setShowExitSessionPrompt(false);
    sessionDateRef.current = today(); setScreen("session"); startSound();
    elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    startCycleRef.current(0, total, pr);
    // Broadcast to together peers
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type:"phase", userId: myUserId, phase:"inhale", count:0 }));
  }, [rec, trainingDay, goal, startSound, countCadenceMultiplier, safetyConsentAccepted, guardianConsentAcknowledged, myUserId]);

  const stopEarly = useCallback(() => endSession(cycleNum, totalCycles), [cycleNum, totalCycles, endSession]);
  const restartCurrentSession = useCallback(() => { cleanupActiveSession(); startSession(); }, [cleanupActiveSession, startSession]);

  // ── WebSocket — Breathe Together ──────────────────────────────────
  const connectTogether = useCallback((roomId: string) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (togetherConnectTimeoutRef.current) clearTimeout(togetherConnectTimeoutRef.current);
    setTogetherConnecting(true);
    setTogetherError("");
    const wsUrl = getTogetherWsUrl();
    const ws = new WebSocket(wsUrl);
    let opened = false;
    wsRef.current = ws;
    togetherConnectTimeoutRef.current = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        setTogetherError(`Could not reach the Breathe Together server at ${wsUrl}. Start it with npm run ws, or use npm run dev:full.`);
        setTogetherConnecting(false);
      }
    }, 5000);
    ws.onopen = () => {
      opened = true;
      if (togetherConnectTimeoutRef.current) clearTimeout(togetherConnectTimeoutRef.current);
      ws.send(JSON.stringify({ type:"join", userId: myUserId, roomId }));
      setTogetherConnected(true);
      setTogetherConnecting(false);
      setTogetherRoomId(roomId);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "peer_joined") { setTogetherPeers(msg.peers.filter((id: string) => id !== myUserId).map((id: string) => ({ userId:id, phase:"rest", count:0 }))); }
        if (msg.type === "peer_left") { setTogetherPeers(p => p.filter(peer => peer.userId !== msg.userId)); }
        if (msg.type === "phase") { setTogetherPeers(p => p.map(peer => peer.userId === msg.userId ? { ...peer, phase: msg.phase, count: msg.count } : peer)); }
      } catch {}
    };
    ws.onerror = () => {
      setTogetherError(`Could not connect to ${wsUrl}. Make sure the WebSocket server is running.`);
    };
    ws.onclose = () => {
      if (togetherConnectTimeoutRef.current) clearTimeout(togetherConnectTimeoutRef.current);
      setTogetherConnected(false);
      setTogetherConnecting(false);
      setTogetherPeers([]);
      if (wsRef.current === ws) {
        setTogetherError(opened ? "Breathe Together disconnected. Check that the WebSocket server is still running." : `Connection closed. Start the Breathe Together server with npm run ws, or run npm run dev:full.`);
      }
    };
  }, [myUserId]);

  const disconnectTogether = useCallback(() => {
    if (togetherConnectTimeoutRef.current) clearTimeout(togetherConnectTimeoutRef.current);
    if (wsRef.current) { const ws = wsRef.current; wsRef.current = null; ws.send(JSON.stringify({ type:"leave", userId: myUserId })); ws.close(); }
    setTogetherConnected(false); setTogetherConnecting(false); setTogetherPeers([]); setTogetherRoomId(""); setTogetherError("");
  }, [myUserId]);

  useEffect(() => () => { if (togetherConnectTimeoutRef.current) clearTimeout(togetherConnectTimeoutRef.current); wsRef.current?.close(); }, []);

  // ── Setup submit ──────────────────────────────────────────────────
  const onSetupSubmit = useCallback((data: SetupForm) => {
    if (!safetyConsentAccepted || !guardianConsentAcknowledged) return;
    const p: Profile = { age: data.age, gender: data.gender, weight: data.weight, systolic: data.systolic, diastolic: data.diastolic };
    setProfile(p);
    const r = getRecommendation(p, goal);
    setRec(r);
    if (bpLog.length === 0) {
      const s = p.systolic ? parseInt(p.systolic) : 120;
      const d = p.diastolic ? parseInt(p.diastolic) : 80;
      setBpLog([{ date: today(), s, d, day: 1 }]);
    }
    setScreen("dashboard");
  }, [safetyConsentAccepted, guardianConsentAcknowledged, goal, bpLog.length]);

  const handleNewBp = () => {
    if (!newBp.s || !newBp.d) return;
    setBpLog(l => [...l, { date: today(), s: parseInt(newBp.s), d: parseInt(newBp.d), day: trainingDay }]);
    setNewBp({ s:"", d:"" }); setShowBpModal(false);
  };

  const clearAllLocalData = useCallback(() => {
    cleanupActiveSession(); stopSleepSounds();
    window.localStorage.removeItem(STORAGE_KEY);
    setProfile({ age:"", gender:"male", weight:"", systolic:"", diastolic:"" });
    setGoal("bp"); setRec(null); setNature("Ocean Waves"); setSoundOn(true);
    setSessionSelectedSoundIds(["Ocean Waves"]); setSessionSoundAutoRotate(true);
    setTrainingDay(1); setHistory({}); setBpLog([]);
    setSleepDuration(0); setSleepVolume(0.7); setSleepSelectedSoundIds(DEFAULT_SLEEP_SOUND_IDS);
    setCountCadenceMultiplier(1.25); setSafetyConsentAccepted(false); setGuardianConsentAcknowledged(false);
    setLastSessionSummary(null); setShowBpModal(false); setRemindersOn(false);
    setScreen("welcome");
  }, [cleanupActiveSession, stopSleepSounds, DEFAULT_SLEEP_SOUND_IDS]);

  const handleExport = () => {
    if (authSession?.user?.id) { window.open("/api/export"); return; }
    const data = { profile, bpLog, history, trainingDay, goal };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `breatheos-${today()}.json`; a.click(); URL.revokeObjectURL(url);
  };

  // ── Style helpers ─────────────────────────────────────────────────
  // glassCard = combined double-bezel visual
  const glassCard: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(127,255,212,0.03) 0%, rgba(6,18,32,0.8) 100%)",
    border: "1px solid rgba(127,255,212,0.09)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "inset 0 1px 0 rgba(127,255,212,0.06), 0 1px 3px rgba(0,0,0,0.4)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };
  const glassCardInner: React.CSSProperties = {
    background: "rgba(6,18,32,0.75)",
    borderRadius: 15,
    padding: 20,
    boxShadow: "inset 0 1px 1px rgba(127,255,212,0.04)",
  };
  const labelStyle: React.CSSProperties = { display:"block", fontFamily:"'Cormorant Garamond',serif", color:"rgba(127,255,212,0.65)", fontSize:11, letterSpacing:2.5, textTransform:"uppercase", marginBottom:7 };
  const renderSleepVolumeControl = (framed = false) => (
    <div style={{
      display:"grid",
      gridTemplateColumns:"auto minmax(0,1fr) auto",
      alignItems:"center",
      gap:12,
      padding:framed ? "12px 14px" : 0,
      border:framed ? "1px solid rgba(127,255,212,0.12)" : "none",
      borderRadius:framed ? 12 : 0,
      background:framed ? "rgba(127,255,212,0.04)" : "transparent",
      minWidth:0,
    }}>
      <span style={{fontSize:15,lineHeight:1,color:"rgba(232,244,240,0.55)"}}>🔈</span>
      <input
        aria-label="Sleep sounds volume"
        className="breatheos-volume-range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(sleepVolume*100)}
        onChange={(event)=>setSleepVolume(Number(event.currentTarget.value)/100)}
        style={{"--volume-progress":`${Math.round(sleepVolume*100)}%`} as React.CSSProperties}
      />
      <span style={{fontSize:15,lineHeight:1,color:"rgba(232,244,240,0.75)"}}>🔊</span>
    </div>
  );

  // ── Nav bar ───────────────────────────────────────────────────────
  const showNav = !["intro","welcome","session"].includes(screen);
  const isSession = screen === "session";

  // ─────────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────────
  if (!hydrated) return (
    <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#030b14 0%,#0a1628 50%,#061220 100%)", color:"#7fffd4", fontFamily:"'Cormorant Garamond',serif", letterSpacing:2 }}>
      Restoring your space...
    </div>
  );

  return (
    <div style={{ height:"100dvh", width:"100vw", background:"linear-gradient(135deg,#030b14 0%,#0a1628 50%,#061220 100%)", backgroundSize:"400% 400%", animation:"breatheos-gradient 20s ease infinite", fontFamily:"Georgia,serif", color:"#e8f4f0", overflow:"hidden", position:"relative" }}>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", background:"radial-gradient(ellipse at 20% 20%,rgba(127,255,212,0.04) 0%,transparent 50%),radial-gradient(ellipse at 80% 80%,rgba(135,206,235,0.03) 0%,transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(192,132,252,0.02) 0%,transparent 60%)", zIndex:0 }} />

      {/* ── BP Modal (shadcn Dialog) ── */}
      <Dialog open={showBpModal} onOpenChange={setShowBpModal}>
        <DialogContent style={{ background:"rgba(10,22,40,0.97)", border:"1px solid rgba(127,255,212,0.2)", borderRadius:16, maxWidth:380 }}>
          <DialogHeader>
            <div style={{textAlign:"center",marginBottom:12}}><span style={{fontSize:44}}>🩺</span></div>
            <DialogTitle style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:"#7fffd4",textAlign:"center"}}>Time for a BP Check</DialogTitle>
          </DialogHeader>
          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.6)",lineHeight:1.6,textAlign:"center",marginBottom:16}}>
            You&apos;ve completed {trainingDay} days! Enter your current blood pressure.
          </p>
          {bpLog[0] && <div style={{textAlign:"center",marginBottom:16,padding:10,background:"rgba(127,255,212,0.06)",borderRadius:8}}><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(127,255,212,0.5)",letterSpacing:2}}>STARTING BP </span><span style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#e8f4f0"}}>{bpLog[0].s}/{bpLog[0].d}</span></div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            {([["Systolic","s"],["Diastolic","d"]] as const).map(([lbl,k]) => (
              <div key={k}><label style={labelStyle}>{lbl}</label><input className="breatheos-input" type="number" placeholder={k==="s"?"120":"80"} value={newBp[k]} onChange={e=>setNewBp(b=>({...b,[k]:e.target.value}))} onWheel={e=>e.currentTarget.blur()} /></div>
            ))}
          </div>
          <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn" style={{width:"100%",marginBottom:10}} onClick={handleNewBp}>Save Reading</motion.button>
          <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.98}} className="breatheos-btn-ghost" style={{width:"100%",textAlign:"center"}} onClick={()=>setShowBpModal(false)}>Skip for now</motion.button>
        </DialogContent>
      </Dialog>

      {/* ══ EXIT SESSION MODAL ══
           FIX: Framer Motion’s animate={{y:0}} overwrites the CSS transform property
           entirely, which lost translateX(-50%) on mobile. Solution: a plain outer div
           handles all positioning via flexbox; the motion.div only controls opacity
           and translateY with no CSS transform conflict.
           Desktop: flexbox center (alignItems center + justifyContent center)
           Mobile: flexbox end (alignItems center + justifyContent flex-end = bottom) */}
      <AnimatePresence>
        {showExitSessionPrompt && (
          <div
            style={{ position:"fixed", inset:0, zIndex:1000,
              display:"flex",
              alignItems: isDesktop ? "center" : "flex-end",
              justifyContent: "center",
            }}
          >
            {/* Backdrop */}
            <motion.div
              key="exit-backdrop"
              initial={{ opacity:0 }}
              animate={{ opacity:1 }}
              exit={{ opacity:0 }}
              transition={{ duration:0.2 }}
              onClick={() => setShowExitSessionPrompt(false)}
              style={{ position:"absolute", inset:0, background:"rgba(3,11,20,0.85)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)" }}
            />
            {/* Dialog — position:relative so it sits inside the flexbox,
                no CSS transform; Framer Motion animates y + opacity only */}
            <motion.div
              key="exit-dialog"
              initial={{ opacity:0, y: isDesktop ? -20 : 60 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y: isDesktop ? -10 : 60 }}
              transition={{ type:"spring", stiffness:420, damping:38 }}
              style={{
                position:"relative",
                zIndex:1,
                width: isDesktop ? "calc(100% - 48px)" : "100%",
                maxWidth: isDesktop ? 420 : 520,
                borderRadius: isDesktop ? 16 : "16px 16px 0 0",
                background:"rgba(10,22,40,0.97)",
                border:"1px solid rgba(248,113,113,0.18)",
                padding:"28px 24px",
                paddingBottom:"max(28px,env(safe-area-inset-bottom,28px))",
                display:"flex", flexDirection:"column", gap:10,
              }}
            >
              <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:"#f7fbf9", marginBottom:2, fontWeight:400 }}>End this session?</h3>
              <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:14, color:"rgba(232,244,240,0.6)", lineHeight:1.7, marginBottom:6 }}>
                Day {trainingDay} · {cycleNum} of {Math.max(totalCycles,1)} cycles · {fmtTime(elapsed)} elapsed
              </p>
              <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn" style={{width:"100%"}} onClick={()=>setShowExitSessionPrompt(false)}>
                Continue Session
              </motion.button>
              <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.98}} className="breatheos-btn-ghost" style={{width:"100%",textAlign:"center"}} onClick={restartCurrentSession}>
                Restart This Session
              </motion.button>
              <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.98}} onClick={stopEarly}
                style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.2)",color:"rgba(248,113,113,0.86)",borderRadius:12,padding:"13px 16px",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",fontSize:15,letterSpacing:1,width:"100%"}}>
                End and Save Progress
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── cmdk Sound Search ── */}
      <Command.Dialog open={soundSearchOpen} onOpenChange={setSoundSearchOpen} label="Sound search"
        style={{position:"fixed",inset:0,zIndex:200,background:"rgba(3,11,20,0.92)",display:"flex",alignItems:"flex-end",backdropFilter:"blur(10px)"}}>
        <div style={{width:"100%",maxWidth:520,margin:"0 auto",background:"rgba(10,22,40,0.98)",borderRadius:"16px 16px 0 0",border:"1px solid rgba(127,255,212,0.15)",padding:16,maxHeight:"70vh",overflow:"auto"}}>
          <p style={{...labelStyle,marginBottom:8}}>Find a Sound</p>
          <Command.Input placeholder="Search sounds…" className="breatheos-input" style={{marginBottom:12}} />
          <Command.List>
            <Command.Empty style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.4)",padding:12,textAlign:"center"}}>No sounds found.</Command.Empty>
            {SOUND_PRESETS.map(s => (
              <Command.Item key={s.id} value={s.name} onSelect={() => {
                if (soundSearchTarget === "session") setSessionSelectedSoundIds(prev => prev.includes(s.id) ? prev : [...prev, s.id]);
                else setSleepSelectedSoundIds(prev => prev.includes(s.id) ? prev : [...prev, s.id]);
                setSoundSearchOpen(false);
              }} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.8)"}}>
                <span style={{fontSize:18}}>{s.emoji}</span>
                <span>{s.name}</span>
                <span style={{marginLeft:"auto",fontSize:11,color:"rgba(127,255,212,0.4)",letterSpacing:1}}>{s.category}</span>
              </Command.Item>
            ))}
          </Command.List>
        </div>
      </Command.Dialog>

      {/* Grain/noise overlay — fixed, pointer-events-none */}
      <div className="breatheos-grain" aria-hidden="true" />

      {/* Sidebar nav — desktop only */}
      {showNav && isDesktop && (
        <SidebarNav screen={screen} sleepPlaying={sleepPlaying} stopSleepSounds={stopSleepSounds} setScreen={setScreen} trainingDay={trainingDay} history={history} rec={rec} />
      )}

      {/* Creator signature — all screens except active session */}
      {!isSession && <CreatorSignature variant="badge" projectName="BreatheOS" />}

      <div className={isDesktop ? "breatheos-desktop-content" : ""} style={{ width:"100%", maxWidth: isDesktop ? "none" : 520, margin:"0 auto", height:"100dvh", overflow:"hidden", display:"flex", flexDirection:"column", position:"relative", zIndex:1, paddingBottom: showNav && !isDesktop ? 72 : 0, paddingLeft: isDesktop && showNav ? 200 : 0 }}>

        {/* ══ INTRO ══ */}
        {screen === "intro" && (
          <motion.div
            initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.5}}
            onClick={()=>{ setScreen(postIntroScreen); setIntroStep(0); }}
            style={{position:"fixed",inset:0,zIndex:100,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",background:"#030b14",overflow:"hidden"}}>
            <motion.div animate={{opacity:introStep>=2?[0.25,0.55,0.25]:0,scale:introStep>=2?[0.85,1.25,0.85]:0.5}} transition={{duration:5,repeat:Infinity,ease:"easeInOut"}} style={{position:"absolute",width:480,height:480,borderRadius:"50%",background:"radial-gradient(circle,rgba(127,255,212,0.16) 0%,rgba(127,255,212,0.04) 50%,transparent 70%)",filter:"blur(30px)",pointerEvents:"none"}} />
            {[300,230,160].map((sz,i)=>(
              <motion.div key={i} initial={{opacity:0,scale:0.3}} animate={introStep>=2?{opacity:[0,0.1-i*0.02,0],scale:[0.3,1.6+i*0.12]}:{opacity:0,scale:0.3}} transition={{duration:3.8,repeat:Infinity,delay:i*0.8,ease:"easeOut"}} style={{position:"absolute",width:sz,height:sz,borderRadius:"50%",border:"1px solid rgba(127,255,212,0.6)",pointerEvents:"none"}} />
            ))}
            <motion.div animate={introStep>=1?{scale:[0.82,1.18,0.82],boxShadow:["0 0 18px rgba(127,255,212,0.15)","0 0 55px rgba(127,255,212,0.45)","0 0 18px rgba(127,255,212,0.15)"]}:{scale:0.5}} transition={{duration:4,repeat:Infinity,ease:"easeInOut"}} style={{width:96,height:96,borderRadius:"50%",background:"radial-gradient(circle,rgba(127,255,212,0.22) 0%,rgba(127,255,212,0.06) 55%,transparent 75%)",border:"1.5px solid rgba(127,255,212,0.35)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",zIndex:2,marginBottom:12}}>
              <motion.span initial={{opacity:0,scale:0.2,filter:"blur(6px)"}} animate={introStep>=3?{opacity:1,scale:1,filter:"blur(0px)"}:{opacity:0,scale:0.2,filter:"blur(6px)"}} transition={{duration:1.6,ease:[0.34,1.56,0.64,1]}} style={{fontSize:36,filter:"drop-shadow(0 0 14px rgba(127,255,212,0.9))",lineHeight:1}}>🌿</motion.span>
            </motion.div>
            <motion.h1 initial={{opacity:0,y:24,filter:"blur(10px)"}} animate={introStep>=4?{opacity:1,y:0,filter:"blur(0px)"}:{opacity:0,y:24,filter:"blur(10px)"}} transition={{duration:1.3,ease:"easeOut"}} style={{fontFamily:"'Playfair Display',serif",fontSize:48,fontWeight:400,lineHeight:1,margin:"14px 0 5px",background:"linear-gradient(135deg,#7fffd4 0%,#87ceeb 55%,#c084fc 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",position:"relative",zIndex:2,textAlign:"center"}}>BreatheOS</motion.h1>
            <motion.div initial={{opacity:0,y:10}} animate={introStep>=5?{opacity:1,y:0}:{opacity:0,y:10}} transition={{duration:1,ease:"easeOut"}} style={{textAlign:"center",position:"relative",zIndex:2}}>
              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(127,255,212,0.5)",letterSpacing:5,textTransform:"uppercase",marginBottom:5}}>Cardiovascular Meditation</p>
              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(127,255,212,0.22)",letterSpacing:3,textTransform:"uppercase"}}>Blood Pressure · Lung Capacity · Breath Hold</p>
            </motion.div>
            <FloatingParticles />
            {/* Intro designer credit */}
            <motion.p
              initial={{opacity:0}}
              animate={introStep>=5?{opacity:1}:{opacity:0}}
              transition={{duration:1.2,delay:0.3}}
              style={{position:"absolute",bottom:"max(70px,env(safe-area-inset-bottom,70px))",fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:"rgba(127,255,212,0.35)",letterSpacing:4,textTransform:"uppercase",zIndex:2,pointerEvents:"none",textAlign:"center"}}
            >
              Designed by Godstime Aburu
            </motion.p>
            <motion.p initial={{opacity:0}} animate={introStep>=1?{opacity:0.28}:{opacity:0}} transition={{duration:2,delay:1.2}} style={{position:"absolute",bottom:"max(30px,env(safe-area-inset-bottom,30px))",fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"#7fffd4",letterSpacing:3,textTransform:"uppercase",zIndex:2,pointerEvents:"none"}}>Tap to skip</motion.p>
          </motion.div>
        )}

        {/* ══ WELCOME ══ */}
        <AnimatePresence mode="wait">
          {screen === "welcome" && (
            <motion.div key="welcome" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:"24px 28px",textAlign:"center",position:"relative",overflowY:"auto"}} className="breatheos-scroll">
              <FloatingParticles />
              <motion.div style={{position:"relative",width:120,height:120,marginBottom:24,flexShrink:0}} initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} transition={{duration:0.8,ease:"easeOut"}}>
                <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"1px solid rgba(127,255,212,0.15)",animation:"float 4s ease-in-out infinite"}} />
                <div style={{position:"absolute",inset:10,borderRadius:"50%",border:"1px solid rgba(127,255,212,0.12)",animation:"float 4s ease-in-out infinite 0.5s"}} />
                <div style={{position:"absolute",inset:20,borderRadius:"50%",background:"radial-gradient(circle,rgba(127,255,212,0.15) 0%,transparent 70%)",display:"flex",alignItems:"center",justifyContent:"center",animation:"float 4s ease-in-out infinite 0.15s"}}>
                  <span style={{fontSize:40,filter:"drop-shadow(0 0 20px rgba(127,255,212,0.7))"}}>🌿</span>
                </div>
              </motion.div>
              <motion.h1 initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2,duration:0.6}} style={{fontFamily:"'Playfair Display',serif",fontSize:44,fontWeight:400,lineHeight:1,marginBottom:10}} className="breatheos-gradient-text">BreatheOS</motion.h1>
              <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.4}} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(127,255,212,0.45)",letterSpacing:6,marginBottom:20,textTransform:"uppercase"}}>Cardiovascular Meditation</motion.p>
              <motion.p initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.5}} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,color:"rgba(232,244,240,0.55)",lineHeight:1.7,marginBottom:20,maxWidth:340}}>A progressive breathing system that lowers blood pressure, expands lung capacity, and trains your cardiovascular system.</motion.p>
              <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.6}} style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:28}}>
                {["💓 BP Reduction","🫁 Lung Training","⏱ Breath Hold","🌊 Nature Sounds"].map(t=>(
                  <span key={t} style={{background:"rgba(127,255,212,0.06)",border:"1px solid rgba(127,255,212,0.12)",borderRadius:40,padding:"5px 14px",fontSize:12,fontFamily:"'Cormorant Garamond',serif",color:"rgba(127,255,212,0.7)"}}>{t}</span>
                ))}
              </motion.div>
              <motion.button whileHover={{scale:1.04,boxShadow:"0 0 30px rgba(127,255,212,0.3)"}} whileTap={{scale:0.97}} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.7}} className="breatheos-btn" style={{fontSize:16,padding:"16px 44px"}} onClick={()=>setScreen("setup")}>Begin Your Journey</motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ SETUP ══ */}
        <AnimatePresence mode="wait">
          {screen === "setup" && (
            <motion.div key="setup" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,padding:"28px 24px",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <motion.div variants={fadeInUp} style={{textAlign:"center",marginBottom:32}}>
                  <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:32,color:"#7fffd4",marginBottom:8}}>Your Health Profile</h2>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.5)",fontSize:15}}>We&apos;ll build a plan around your body and blood pressure</p>
                </motion.div>

                <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:20,border:"1px solid rgba(248,113,113,0.18)",background:"linear-gradient(135deg,rgba(248,113,113,0.06),rgba(127,255,212,0.03))"}}>
                  <p style={{...labelStyle,color:"rgba(248,113,113,0.75)"}}>Safety First</p>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.72)",lineHeight:1.7,marginBottom:8}}>Stop immediately and seek urgent care if you feel chest pain, fainting, severe shortness of breath, confusion, or vision loss during any session.</p>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(248,113,113,0.72)",lineHeight:1.6}}>This app supports guided wellness practice. It is not emergency monitoring or medical treatment.</p>
                </motion.div>

                <motion.div variants={fadeInUp} style={{marginBottom:20}}>
                  <label style={labelStyle}>Training Goal</label>
                  <div className="breatheos-goal-grid">
                    {GOAL_OPTIONS.map(option=>{
                      const selected = goal === option.id;
                      return (
                        <motion.button
                          key={option.id}
                          whileHover={{scale:1.02}}
                          whileTap={{scale:0.98}}
                          onClick={()=>setGoal(option.id)}
                          style={{
                            background:selected?"linear-gradient(135deg,rgba(127,255,212,0.14),rgba(135,206,235,0.07))":"rgba(127,255,212,0.03)",
                            border:`1px solid ${selected?"rgba(127,255,212,0.48)":"rgba(127,255,212,0.1)"}`,
                            color:selected?"#7fffd4":"rgba(232,244,240,0.58)",
                            borderRadius:10,
                            padding:"12px",
                            cursor:"pointer",
                            fontFamily:"'Cormorant Garamond',serif",
                            transition:"all 0.2s",
                            textAlign:"left",
                            minWidth:0,
                            minHeight:116,
                            display:"flex",
                            flexDirection:"column",
                            gap:7,
                          }}
                        >
                          <span style={{display:"flex",alignItems:"center",gap:7,fontSize:15,lineHeight:1.15}}>
                            <span aria-hidden="true" style={{fontSize:18,lineHeight:1}}>{option.icon}</span>
                            <span style={{fontWeight:600}}>{option.label}</span>
                          </span>
                          <span style={{fontSize:12,color:selected?"rgba(232,244,240,0.72)":"rgba(232,244,240,0.38)",lineHeight:1.35}}>
                            {option.detail}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>

                <form onSubmit={handleSubmit(onSetupSubmit)}>
                  {([["age","Age (years)","35"],["weight","Weight (kg)","70"],["systolic","Systolic BP","120"],["diastolic","Diastolic BP","80"]] as const).map(([field,lbl,ph])=>(
                    <motion.div key={field} variants={fadeInUp} style={{marginBottom:16}}>
                      <label style={labelStyle}>{lbl}</label>
                      <input {...register(field)} type="number" placeholder={ph} className="breatheos-input" onWheel={e=>e.currentTarget.blur()} />
                      {errors[field] && <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(248,113,113,0.8)",marginTop:4}}>{errors[field]?.message}</p>}
                    </motion.div>
                  ))}
                  <motion.div variants={fadeInUp} style={{marginBottom:16}}>
                    <label style={labelStyle}>Gender</label>
                    <select {...register("gender")} className="breatheos-input">
                      <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                    </select>
                  </motion.div>

                  <motion.div variants={fadeInUp} style={{...glassCard, marginBottom:20, border:"1px solid rgba(127,255,212,0.12)", background:"linear-gradient(135deg,rgba(3,11,20,0.6),rgba(10,22,40,0.4))"}}>
                    <p style={{...labelStyle, marginBottom:12}}>Safety & Consent</p>

                    <div style={{background:"rgba(248,113,113,0.04)", border:"1px solid rgba(248,113,113,0.1)", borderRadius:8, padding:"12px 14px", marginBottom:14}}>
                      <p style={{fontFamily:"'Cormorant Garamond',serif", fontSize:13, color:"rgba(232,244,240,0.6)", lineHeight:1.7, marginBottom:0}}>
                        Stop immediately and seek urgent care if you experience <span style={{color:"rgba(248,113,113,0.8)"}}>chest pain, fainting, severe shortness of breath, confusion, or vision loss</span> during any session. This app supports guided wellness practice — it is not emergency monitoring or medical treatment.
                      </p>
                    </div>

                    <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.98}} type="button" onClick={()=>setSafetyConsentAccepted(v=>!v)}
                      style={{width:"100%", display:"flex", alignItems:"center", gap:14, background:safetyConsentAccepted?"rgba(127,255,212,0.06)":"rgba(127,255,212,0.02)", border:`1px solid ${safetyConsentAccepted?"rgba(127,255,212,0.3)":"rgba(127,255,212,0.08)"}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", marginBottom:10, transition:"all 0.2s"}}>
                      <div style={{width:20, height:20, borderRadius:4, border:`1.5px solid ${safetyConsentAccepted?"#7fffd4":"rgba(127,255,212,0.25)"}`, background:safetyConsentAccepted?"rgba(127,255,212,0.2)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.2s"}}>
                        {safetyConsentAccepted && <span style={{color:"#7fffd4", fontSize:13, lineHeight:1}}>✓</span>}
                      </div>
                      <span style={{fontFamily:"'Cormorant Garamond',serif", fontSize:14, color:safetyConsentAccepted?"rgba(232,244,240,0.85)":"rgba(232,244,240,0.5)", textAlign:"left" as const, lineHeight:1.5}}>I have read and understand the safety guidelines above</span>
                    </motion.button>

                    <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.98}} type="button" onClick={()=>setGuardianConsentAcknowledged(v=>!v)}
                      style={{width:"100%", display:"flex", alignItems:"center", gap:14, background:guardianConsentAcknowledged?"rgba(127,255,212,0.06)":"rgba(127,255,212,0.02)", border:`1px solid ${guardianConsentAcknowledged?"rgba(127,255,212,0.3)":"rgba(127,255,212,0.08)"}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", transition:"all 0.2s"}}>
                      <div style={{width:20, height:20, borderRadius:4, border:`1.5px solid ${guardianConsentAcknowledged?"#7fffd4":"rgba(127,255,212,0.25)"}`, background:guardianConsentAcknowledged?"rgba(127,255,212,0.2)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.2s"}}>
                        {guardianConsentAcknowledged && <span style={{color:"#7fffd4", fontSize:13, lineHeight:1}}>✓</span>}
                      </div>
                      <span style={{fontFamily:"'Cormorant Garamond',serif", fontSize:14, color:guardianConsentAcknowledged?"rgba(232,244,240,0.85)":"rgba(232,244,240,0.5)", textAlign:"left" as const, lineHeight:1.5}}>I am 18 years or older, or have guardian consent to use this app</span>
                    </motion.button>
                  </motion.div>

                  <motion.button variants={fadeInUp} whileHover={{scale:1.02}} whileTap={{scale:0.98}} type="submit" className="breatheos-btn" style={{width:"100%",fontSize:16,padding:"16px",opacity:(!safetyConsentAccepted||!guardianConsentAcknowledged)?0.4:1}}>Start My Plan</motion.button>
                </form>

                {rec && <motion.button variants={fadeInUp} whileHover={{scale:1.01}} whileTap={{scale:0.98}} className="breatheos-btn-ghost" style={{width:"100%",textAlign:"center",marginTop:10}} onClick={()=>setScreen("settings")}>⚙️ Session Settings</motion.button>}

                <motion.div variants={fadeInUp} style={{marginTop:20,textAlign:"center"}}>
                  {authSession?.user ? (
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
                      <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(127,255,212,0.5)"}}>☁️ Syncing as {authSession.user.email}</span>
                      <button onClick={()=>signOut()} className="breatheos-btn-ghost" style={{padding:"6px 12px",fontSize:12}}>Sign out</button>
                    </div>
                  ) : (
                    <button onClick={()=>signIn()} className="breatheos-btn-ghost" style={{fontSize:13}}>☁️ Sign in to sync across devices</button>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ DASHBOARD ══ */}
        <AnimatePresence mode="wait">
          {screen === "dashboard" && rec && (
            <motion.div key="dashboard" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,padding:"28px 24px",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <motion.div variants={fadeInUp} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:28}}>
                  <div>
                    <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:32,color:"#7fffd4",marginBottom:4}}>Day {trainingDay}</h2>
                    <p style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.5)",fontSize:14}}>{prog.name} · {prog.technique}</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(127,255,212,0.4)",marginBottom:2}}>Today&apos;s goal</p>
                    <p style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#e8f4f0"}}>{rec.sessionsPerDay}× · {rec.minutes} min</p>
                  </div>
                </motion.div>

                <motion.button variants={scaleIn} whileHover={{scale:1.02,boxShadow:"0 0 40px rgba(127,255,212,0.25)"}} whileTap={{scale:0.98}} className="breatheos-btn" style={{width:"100%",fontSize:17,padding:"22px",marginBottom:20}} onClick={startSession}>
                  {sessionStarted ? "▶ Continue Session" : "▶ Start Session"}
                </motion.button>

                <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                  <p style={labelStyle}>Today&apos;s Program</p>
                  <p style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:"#e8f4f0",marginBottom:6}}>{prog.emoji} {prog.name}</p>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.55)",lineHeight:1.6,marginBottom:10}}>{prog.desc}</p>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {Object.entries(prog.phases).map(([k,v])=>v>0&&(<span key={k} style={{background:"rgba(127,255,212,0.06)",border:"1px solid rgba(127,255,212,0.1)",borderRadius:20,padding:"4px 12px",fontSize:12,fontFamily:"'Cormorant Garamond',serif",color:"rgba(127,255,212,0.7)"}}>{k==="inhale"?"In":k==="holdIn"?"Hold":k==="exhale"?"Out":"Hold∅"}: {v}s</span>))}
                  </div>
                </motion.div>

                {latestBp && (
                  <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div><p style={labelStyle}>Latest BP</p><p style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:"#e8f4f0"}}>{latestBp.s}/{latestBp.d} <span style={{fontSize:12,color:"rgba(232,244,240,0.4)"}}>mmHg</span></p></div>
                    <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn-ghost" onClick={()=>setShowBpModal(true)}>+ Log</motion.button>
                  </motion.div>
                )}

                <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <p style={labelStyle}>Program Progress</p>
                    <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(127,255,212,0.5)"}}>{trainingDay} / 84 days</span>
                  </div>
                  <Progress value={(trainingDay/84)*100} className="breatheos-progress" />
                </motion.div>

                {rec.notes.length > 0 && (
                  <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                    <p style={labelStyle}>Your Plan Notes</p>
                    {rec.notes.map((n,i)=>(<p key={i} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.6)",lineHeight:1.6,marginBottom:4}}>· {n}</p>))}
                  </motion.div>
                )}

                <motion.div variants={fadeInUp} style={{...glassCard}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <p style={labelStyle}>Breathe Together</p>
                    <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn-ghost" onClick={()=>setScreen("together")}>Join Room</motion.button>
                  </div>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.45)",lineHeight:1.6}}>Sync your breathing session with another person in real time.</p>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ SESSION ══ */}
        <AnimatePresence mode="wait">
          {screen === "session" && (
            <motion.div key="session"
              data-session-screen
              initial={{ opacity:0 }}
              animate={{ opacity:1, transition:{ duration:0.4 } }}
              exit={{ opacity:0, transition:{ duration:0.25 } }} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding: isDesktop ? "40px 80px" : "24px 28px",position:"relative",overflow:"hidden"}}>
              <FloatingParticles />
              <div style={{position:"absolute",top:16,left:0,right:0,padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",zIndex:2}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(127,255,212,0.5)",letterSpacing:1}}>Day {trainingDay} · {prog.name}</div>
                <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>setShowExitSessionPrompt(true)} style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.2)",color:"rgba(248,113,113,0.7)",borderRadius:20,padding:"6px 14px",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",fontSize:12,letterSpacing:1}}>End</motion.button>
              </div>

              <div style={{position:"absolute",top:52,left:24,right:24,zIndex:2}}>
                <Progress value={sessionProgress} className="breatheos-progress" />
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                  <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(127,255,212,0.35)"}}>{cycleNum}/{totalCycles} cycles</span>
                  <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(127,255,212,0.35)"}}>{fmtTime(elapsed)}</span>
                </div>
              </div>

              {/* Main breathing circle */}
              <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",marginTop:20}}>
                {[160,130,100].map((sz,i)=>(<div key={i} style={{position:"absolute",width:sz+40,height:sz+40,borderRadius:"50%",border:`1px solid ${circleColor}`,opacity:0.06+i*0.04,animation:`holdPulse 2s ease-in-out infinite ${i*0.3}s`,display:holdPulseActive?"block":"none"}} />))}
                <motion.div animate={{scale:circleScale,boxShadow:`0 0 60px ${circleGlow}, 0 0 120px ${circleGlow.replace("0.5","0.15")}`}} transition={{duration:circleTransDur,ease:circleEasing}} style={{width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle, ${circleColor}22 0%, ${circleColor}08 50%, transparent 70%)`,border:`2px solid ${circleColor}40`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:circleColor,letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>{pc.label}</div>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:52,color:circleColor,lineHeight:1}}>{count}</div>
                  </div>
                </motion.div>
              </div>

              {/* Peer circles */}
              {togetherPeers.length > 0 && (
                <div style={{display:"flex",gap:16,marginTop:20,zIndex:2}}>
                  {togetherPeers.map(peer=>{
                    const peerCfg = PHASE_CONFIG[peer.phase]??PHASE_CONFIG.rest;
                    return (<div key={peer.userId} style={{textAlign:"center"}}>
                      <div style={{width:60,height:60,borderRadius:"50%",border:`1px solid ${peerCfg.color}60`,background:`${peerCfg.color}10`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4,transition:"all 0.3s"}}>
                        <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:peerCfg.color}}>{peer.count}</span>
                      </div>
                      <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:"rgba(127,255,212,0.4)"}}>Together</span>
                    </div>);
                  })}
                </div>
              )}

              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.35)",marginTop:20,textAlign:"center",lineHeight:1.6,maxWidth:240,zIndex:2}}>
                {currentCyclePhases.inhale}s in · {currentCyclePhases.holdIn>0?`${currentCyclePhases.holdIn}s hold · `:""}
                {currentCyclePhases.exhale}s out{currentCyclePhases.holdOut>0?` · ${currentCyclePhases.holdOut}s hold`:""}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ STATS (post-session) ══ */}
        <AnimatePresence mode="wait">
          {screen === "stats" && lastSessionSummary && (
            <motion.div key="stats" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",textAlign:"center",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",duration:0.6}} style={{fontSize:64,marginBottom:20}}>
                {lastSessionSummary.status==="complete"?"✅":lastSessionSummary.status==="partial"?"🌗":"😔"}
              </motion.div>
              <motion.h2 initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.2}} style={{fontFamily:"'Playfair Display',serif",fontSize:32,color:statusColor[lastSessionSummary.status],marginBottom:8}}>
                {lastSessionSummary.status==="complete"?"Session Complete":lastSessionSummary.status==="partial"?"Partial Session":"Session Missed"}
              </motion.h2>
              <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.35}} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:15,color:"rgba(232,244,240,0.55)",marginBottom:28,lineHeight:1.6}}>
                {lastSessionSummary.cyclesCompleted} of {lastSessionSummary.totalCycles} cycles · {fmtTime(lastSessionSummary.elapsed)}
              </motion.p>
              <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.5}} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,width:"100%",maxWidth:320,marginBottom:28}}>
                {[["Day",lastSessionSummary.trainingDay+1],["Cycles",lastSessionSummary.cyclesCompleted],["Time",fmtTime(lastSessionSummary.elapsed)],["Status",lastSessionSummary.status[0].toUpperCase()+lastSessionSummary.status.slice(1)]].map(([l,v])=>(
                  <div key={String(l)} style={{...glassCard,padding:16,textAlign:"center"}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:"#7fffd4",marginBottom:4}}>{v}</div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(232,244,240,0.4)",letterSpacing:2,textTransform:"uppercase"}}>{l}</div>
                  </div>
                ))}
              </motion.div>
              <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.6}} className="breatheos-btn" style={{width:"100%",maxWidth:320,marginBottom:12}} onClick={startSession}>▶ Go Again</motion.button>
              <motion.button whileHover={{scale:1.01}} whileTap={{scale:0.98}} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.7}} className="breatheos-btn-ghost" onClick={()=>setScreen("dashboard")}>Back to Dashboard</motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ CALENDAR ══ */}
        <AnimatePresence mode="wait">
          {screen === "calendar" && (
            <motion.div key="calendar" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,padding:"28px 24px",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <motion.h2 variants={fadeInUp} style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:"#7fffd4",marginBottom:4}}>Session History</motion.h2>
                <motion.p variants={fadeInUp} style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.45)",fontSize:14,marginBottom:24}}>Your breathing journey at a glance</motion.p>

                <motion.div variants={scaleIn} className="breatheos-history-card" style={{...glassCard,marginBottom:20}}>
                  {/* DayPicker v9 uses rdp-root/month_grid/day_button class names. */}
                  <style>{`
                    .breatheos-history-card {
                      display:grid;
                      grid-template-columns:max-content minmax(280px,1fr);
                      gap:34px;
                      align-items:start;
                    }
                    .breatheos-history-side {
                      min-height:100%;
                      display:flex;
                      flex-direction:column;
                      justify-content:space-between;
                      gap:18px;
                      padding:2px 0 2px 10px;
                    }
                    .breatheos-history-legend {
                      display:grid;
                      grid-template-columns:repeat(2,minmax(0,1fr));
                      gap:10px 18px;
                    }
                    .breatheos-history-legend-item {
                      display:flex;
                      align-items:center;
                      gap:9px;
                      min-width:0;
                    }
                    .breatheos-history-dot {
                      width:12px;
                      height:12px;
                      border-radius:999px;
                      flex:0 0 auto;
                    }
                    @media (max-width: 1199px) {
                      .breatheos-history-card {
                        grid-template-columns:1fr;
                        gap:18px;
                        overflow:hidden;
                      }
                      .breatheos-history-side {
                        padding:0;
                      }
                      .breatheos-history-legend {
                        grid-template-columns:1fr;
                      }
                      .breatheos-history-calendar.rdp-root,
                      .breatheos-history-calendar .rdp-months,
                      .breatheos-history-calendar .rdp-month {
                        width:100%;
                      }
                      .breatheos-history-calendar .rdp-month_grid {
                        width:100%;
                        min-width:0;
                      }
                      .breatheos-history-calendar .rdp-weekday,
                      .breatheos-history-calendar .rdp-day {
                        width:auto;
                      }
                    }
                    .breatheos-history-calendar.rdp-root {
                      --rdp-day-width:38px;
                      --rdp-day-height:38px;
                      --rdp-day_button-width:34px;
                      --rdp-day_button-height:34px;
                      --rdp-day_button-border:0;
                      --rdp-day_button-border-radius:999px;
                      --rdp-nav_button-width:32px;
                      --rdp-nav_button-height:32px;
                      margin:0;
                      width:max-content;
                      max-width:100%;
                      font-family:'Cormorant Garamond',serif;
                      color:rgba(232,244,240,0.8);
                    }
                    .breatheos-history-calendar .rdp-months,
                    .breatheos-history-calendar .rdp-month {
                      width:max-content;
                      max-width:100%;
                    }
                    .breatheos-history-calendar .rdp-nav {
                      position:static;
                      height:auto;
                      display:flex;
                      justify-content:flex-start;
                      gap:6px;
                      margin-bottom:6px;
                    }
                    .breatheos-history-calendar .rdp-button_previous,
                    .breatheos-history-calendar .rdp-button_next {
                      width:32px;
                      height:32px;
                      border:0;
                      border-radius:999px;
                      background:rgba(127,255,212,0.06);
                      color:rgba(127,255,212,0.72);
                      cursor:pointer;
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      transition:background 0.18s, color 0.18s, transform 0.18s;
                    }
                    .breatheos-history-calendar .rdp-button_previous:hover,
                    .breatheos-history-calendar .rdp-button_next:hover {
                      background:rgba(127,255,212,0.12);
                      color:#7fffd4;
                      transform:translateY(-1px);
                    }
                    .breatheos-history-calendar .rdp-chevron {
                      width:18px;
                      height:18px;
                      fill:currentColor;
                    }
                    .breatheos-history-calendar .rdp-month_caption {
                      height:auto;
                      display:flex;
                      justify-content:flex-start;
                      margin:0 0 8px;
                      padding:0;
                    }
                    .breatheos-history-calendar .rdp-caption_label {
                      font-family:'Playfair Display',serif;
                      font-size:20px;
                      font-weight:400;
                      color:#7fffd4;
                    }
                    .breatheos-history-calendar .rdp-month_grid {
                      width:266px;
                      table-layout:fixed;
                      border-collapse:separate;
                      border-spacing:0 4px;
                    }
                    .breatheos-history-calendar .rdp-weekday {
                      width:38px;
                      padding:0 0 8px;
                      font-family:'Cormorant Garamond',serif;
                      font-size:12px;
                      line-height:1;
                      color:rgba(232,244,240,0.5);
                      font-weight:600;
                      text-align:center;
                    }
                    .breatheos-history-calendar .rdp-day {
                      width:38px;
                      height:38px;
                      padding:0;
                      text-align:center;
                    }
                    .breatheos-history-calendar .rdp-day_button {
                      width:34px;
                      height:34px;
                      margin:0 auto;
                      border:0;
                      border-radius:999px;
                      background:transparent;
                      color:rgba(232,244,240,0.55);
                      cursor:pointer;
                      font-family:'Cormorant Garamond',serif;
                      font-size:14px;
                      line-height:1;
                      transition:background 0.18s, box-shadow 0.18s, color 0.18s;
                    }
                    .breatheos-history-calendar .rdp-day_button:hover:not(:disabled) {
                      background:rgba(127,255,212,0.07);
                      color:rgba(232,244,240,0.85);
                    }
                    .breatheos-history-calendar .rdp-today:not(.rdp-day_complete):not(.rdp-day_partial):not(.rdp-day_missed) .rdp-day_button {
                      color:#7fffd4;
                      box-shadow:0 2px 0 0 rgba(127,255,212,0.5);
                    }
                    .breatheos-history-calendar .rdp-outside .rdp-day_button {
                      color:rgba(232,244,240,0.18);
                    }
                    .breatheos-history-calendar .rdp-disabled .rdp-day_button {
                      color:rgba(232,244,240,0.12);
                      cursor:default;
                    }
                    .breatheos-history-calendar .rdp-day_complete .rdp-day_button {
                      background:rgba(127,255,212,0.18);
                      color:#7fffd4;
                      box-shadow:0 0 0 1px rgba(127,255,212,0.3);
                      font-weight:600;
                    }
                    .breatheos-history-calendar .rdp-day_partial .rdp-day_button {
                      background:rgba(251,191,36,0.16);
                      color:#fbbf24;
                      box-shadow:0 0 0 1px rgba(251,191,36,0.25);
                    }
                    .breatheos-history-calendar .rdp-day_missed .rdp-day_button {
                      background:rgba(248,113,113,0.14);
                      color:#f87171;
                      box-shadow:0 0 0 1px rgba(248,113,113,0.22);
                    }
                    .breatheos-history-calendar .rdp-selected .rdp-day_button {
                      box-shadow:0 0 0 2px rgba(127,255,212,0.7);
                    }
                  `}</style>
                  <div>
                    <DayPicker
                      className="breatheos-history-calendar"
                      mode="single"
                      selected={selectedDay}
                      onSelect={setSelectedDay}
                      modifiers={{
                        complete: Object.entries(history).filter(([,v])=>v.status==="complete").map(([d])=>new Date(d+"T12:00:00")),
                        partial:  Object.entries(history).filter(([,v])=>v.status==="partial").map(([d])=>new Date(d+"T12:00:00")),
                        missed:   Object.entries(history).filter(([,v])=>v.status==="missed").map(([d])=>new Date(d+"T12:00:00")),
                      }}
                      modifiersClassNames={{
                        complete: "rdp-day_complete",
                        partial:  "rdp-day_partial",
                        missed:   "rdp-day_missed",
                      }}
                    />
                  </div>
                  <div className="breatheos-history-side">
                    {(() => {
                      const activeDate = selectedDay ?? new Date();
                      const key = dateKey(activeDate);
                      const entry = history[key];
                      const isToday = key === today();
                      return (
                        <div>
                          <p style={labelStyle}>{selectedDay ? "Selected Day" : "Today"}</p>
                          <p style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:entry ? statusColor[entry.status] : "#7fffd4",marginBottom:6}}>
                            {activeDate.toLocaleDateString("default",{weekday:"long",month:"long",day:"numeric"})}
                          </p>
                          {entry ? (
                            <>
                              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,color:statusColor[entry.status],marginBottom:4}}>
                                {entry.status[0].toUpperCase()+entry.status.slice(1)} session
                              </p>
                              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.55)",lineHeight:1.6}}>
                                {entry.cyclesCompleted} of {entry.totalCycles} cycles completed{isToday ? " today." : "."}
                              </p>
                            </>
                          ) : (
                            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.55)",lineHeight:1.6}}>
                              No session has been saved for this date yet{isToday ? ". The aqua mark on the calendar is just today's date." : "."}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div>
                      <p style={labelStyle}>Legend</p>
                      <div className="breatheos-history-legend">
                        {[
                          ["Complete","#7fffd4","90%+ cycles"],
                          ["Partial","#fbbf24","40-89% cycles"],
                          ["Missed","#f87171","Under 40% cycles"],
                          ["Today","#7fffd4","Aqua underline"],
                        ].map(([name,color,desc]) => (
                          <div key={name} className="breatheos-history-legend-item">
                            <span className="breatheos-history-dot" style={{background:name==="Today"?"transparent":color,border:`1px solid ${color}`,boxShadow:name==="Today"?`0 2px 0 0 ${color}`:"none"}} />
                            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.62)",lineHeight:1.25}}>
                              <span style={{color:"rgba(232,244,240,0.84)"}}>{name}</span> · {desc}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div variants={fadeInUp} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {(()=>{
                    const complete = Object.values(history).filter(h=>h.status==="complete").length;
                    const streak = (() => { let s=0; const d=new Date(); while(true){ const k=dateKey(d); if(history[k]?.status==="complete"){s++;d.setDate(d.getDate()-1);}else break; } return s; })();
                    // FIX 1: streak is raw number, not `${streak}d`.
                    // The "d" suffix renders in a separate span below to prevent
                    // Playfair Display’s "0d" ligature collapsing to "od".
                    return [["Complete",complete,"#7fffd4"],["Streak",streak,"#ffd700"],["Total Days",trainingDay,"#87ceeb"]].map(([l,v,c])=>(
                      <motion.div key={String(l)} variants={scaleIn} style={{...glassCard,textAlign:"center",padding:16}}>
                        {l === "Streak" ? (
                          <div style={{marginBottom:4,lineHeight:1,display:"flex",alignItems:"flex-start",justifyContent:"center",gap:0}}>
                            <span style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:String(c),fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'liga' 0,'calt' 0",lineHeight:1}}>{String(v)}</span>
                            <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:String(c),lineHeight:1,marginTop:2,marginLeft:2,opacity:0.8}}>d</span>
                          </div>
                        ) : (
                          <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:String(c),marginBottom:4}}>{v}</div>
                        )}
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(232,244,240,0.4)",letterSpacing:2,textTransform:"uppercase"}}>{l}</div>
                      </motion.div>
                    ));
                  })()}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ BP PROGRESS ══ */}
        <AnimatePresence mode="wait">
          {screen === "bp" && (
            <motion.div key="bp" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,padding:"28px 24px",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <motion.div variants={fadeInUp} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:24}}>
                  <div>
                    <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:"#7fffd4",marginBottom:4}}>BP Progress</h2>
                    <p style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.45)",fontSize:14}}>Track your readings over time</p>
                  </div>
                  <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn-ghost" onClick={handleExport} style={{fontSize:12,padding:"8px 14px",whiteSpace:"nowrap"}}>⬇ Export Data</motion.button>
                </motion.div>

                <motion.div variants={scaleIn}><BpChart bpLog={bpLog} trainingDay={trainingDay} rec={rec} /></motion.div>

                <motion.div variants={fadeInUp} style={{...glassCard,marginTop:16,marginBottom:16}}>
                  <p style={labelStyle}>Reading History</p>
                  {bpLog.length === 0 && (<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.45)",lineHeight:1.7}}>No readings yet. Add your first after a session.</p>)}
                  {[...bpLog].reverse().map((b,i)=>{
                    const prev = bpLog[bpLog.length-2-i];
                    const diff = prev ? b.s - prev.s : 0;
                    return (
                      <motion.div key={i} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:i*0.04}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingBottom:14,marginBottom:14,borderBottom:i<bpLog.length-1?"1px solid rgba(127,255,212,0.06)":"none"}}>
                        <div>
                          <p style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#e8f4f0"}}>{b.s}/{b.d} <span style={{fontSize:12,color:"rgba(232,244,240,0.4)"}}>mmHg</span></p>
                          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(232,244,240,0.4)"}}>Day {b.day} — {b.date}</p>
                        </div>
                        {prev && (<span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:diff<0?"#7fffd4":diff>0?"#f87171":"rgba(232,244,240,0.4)"}}>{diff<0?`↓ ${Math.abs(diff)}`:diff>0?`↑ ${diff}`:"—"} mmHg</span>)}
                      </motion.div>
                    );
                  })}
                </motion.div>

                <motion.button variants={fadeInUp} whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn" style={{width:"100%",marginBottom:16}} onClick={()=>setShowBpModal(true)}>🩺 Record New Reading</motion.button>

                {rec && (
                  <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:20}}>
                    <p style={labelStyle}>Estimated Reduction Timeline</p>
                    {rec.weeks.map((w,i)=>{
                      const isPast = trainingDay >= w.week*7;
                      const ns = (bpLog[0]?.s??0) - w.change; const nd = (bpLog[0]?.d??0) - Math.round(w.change*0.6);
                      return (
                        <motion.div key={i} initial={{opacity:0,x:-10}} animate={{opacity:isPast?1:0.6,x:0}} transition={{delay:i*0.05}} style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                          <div style={{width:36,height:36,borderRadius:"50%",background:isPast?`${w.color}25`:"rgba(127,255,212,0.05)",border:`1px solid ${isPast?w.color:"rgba(127,255,212,0.1)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{fontSize:11,fontFamily:"'Cormorant Garamond',serif",color:isPast?w.color:"rgba(232,244,240,0.3)"}}>W{w.week}</span>
                          </div>
                          <div style={{flex:1}}>
                            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:isPast?"rgba(232,244,240,0.85)":"rgba(232,244,240,0.4)",marginBottom:1}}>{w.label}</p>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <p style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:w.change>0?w.color:"rgba(232,244,240,0.4)"}}>{w.change>0?`${ns}/${nd}`:"—"}</p>
                            {w.change>0&&<p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:`${w.color}90`}}>↓ {w.change} mmHg</p>}
                          </div>
                        </motion.div>
                      );
                    })}
                    <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(248,113,113,0.6)",lineHeight:1.6,marginTop:8}}>Timeline estimates are directional coaching targets, not a medical forecast.</p>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ SLEEP SOUNDS ══ */}
        <AnimatePresence mode="wait">
          {screen === "sleep" && (
            <motion.div ref={sleepScrollRef} key="sleep" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,padding:"28px 24px",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <style>{`
                  .breatheos-sleep-grid {
                    display:grid;
                    grid-template-columns:minmax(0,1fr);
                    gap:16px;
                  }
                  .breatheos-sleep-category-grid {
                    display:grid;
                    grid-template-columns:repeat(auto-fit,minmax(132px,1fr));
                    gap:8px;
                  }
                  @media (min-width: 900px) {
                    .breatheos-sleep-grid {
                      grid-template-columns:minmax(0,1fr) minmax(280px,0.72fr);
                      align-items:start;
                    }
                  }
                `}</style>
                <>
                  {sleepPlaying ? (
                    <motion.div key="playing" initial={{opacity:0,scale:0.98}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.98}} className="breatheos-sleep-grid">
                      <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} transition={SPRING} style={{...glassCard,textAlign:"center",background:"linear-gradient(135deg,rgba(127,255,212,0.07),rgba(135,206,235,0.035))",border:"1px solid rgba(127,255,212,0.2)",padding:"28px 22px"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:16}}>
                          {[0,1,2].map(i=>(<motion.div key={i} animate={{scaleY:[1,1.8,1]}} transition={{duration:1.2,repeat:Infinity,delay:i*0.2}} style={{width:3,height:14,borderRadius:2,background:"#7fffd4"}} />))}
                          <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"#7fffd4",letterSpacing:3,textTransform:"uppercase"}}>Now Playing</span>
                        </div>
                        <p style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:"#e8f4f0",marginBottom:4,lineHeight:1.15}}>{sleepCurrentSound||"Starting sound…"}</p>
                        <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:8,marginTop:14}}>
                          <span style={{fontFamily:"'Playfair Display',serif",fontSize:44,color:"#e8f4f0",letterSpacing:2}}>{fmtTime(sleepElapsed)}</span>
                        </div>
                        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(127,255,212,0.5)",marginTop:4,marginBottom:18}}>{sleepDuration>0?`${fmtTime(sleepTimeRemaining)} remaining`:"All Night"}</p>
                        {sleepNextSound && (
                          <div style={{maxWidth:360,margin:"0 auto 18px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:7}}>
                              <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(127,255,212,0.4)"}}>Transitioning</span>
                              <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(127,255,212,0.7)",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sleepNextSound}</span>
                            </div>
                            <div style={{height:4,background:"rgba(127,255,212,0.1)",borderRadius:999,overflow:"hidden"}}><div style={{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#7fffd4,#87ceeb)",width:`${sleepCrossfadeProgress}%`,transition:"width 0.8s"}} /></div>
                          </div>
                        )}
                        <div style={{maxWidth:420,margin:"0 auto"}}>
                          {renderSleepVolumeControl(true)}
                        </div>
                        <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={stopSleepSounds} style={{marginTop:18,background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.25)",borderRadius:24,padding:"12px 32px",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",fontSize:15,color:"rgba(248,113,113,0.86)",letterSpacing:2,textTransform:"uppercase"}}>■ Stop</motion.button>
                      </motion.div>
                      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{...SPRING,delay:0.08}} style={{display:"grid",gap:16}}>
                        <div style={{...glassCard,padding:"18px 18px"}}>
                          <p style={labelStyle}>Sound Mix</p>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                            {activeSleepCategories.map(cat => <span key={cat} style={{border:"1px solid rgba(127,255,212,0.14)",background:"rgba(127,255,212,0.05)",borderRadius:999,padding:"6px 10px",fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(232,244,240,0.72)"}}>{cat}</span>)}
                          </div>
                          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.46)",lineHeight:1.5}}>
                            {sleepSelectedPresets.length} sounds selected. Sounds crossfade automatically while the timer runs.
                          </p>
                        </div>
                        <div style={{...glassCard,padding:"18px 18px"}}>
                          <p style={labelStyle}>Quick Adjust</p>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {SLEEP_DURATIONS.map(d=>(<motion.button key={d.label} whileHover={{scale:1.03}} whileTap={{scale:0.97}} onClick={()=>setSleepDuration(d.value)} style={{background:sleepDuration===d.value?"rgba(127,255,212,0.15)":"rgba(127,255,212,0.03)",border:`1px solid ${sleepDuration===d.value?"rgba(127,255,212,0.5)":"rgba(127,255,212,0.1)"}`,color:sleepDuration===d.value?"#7fffd4":"rgba(232,244,240,0.5)",borderRadius:20,padding:"8px 12px",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",fontSize:12,letterSpacing:1,transition:"all 0.2s"}}>{d.label}</motion.button>))}
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  ) : (
                    <motion.div key="setup-sleep" initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} exit={{opacity:0}}>
                      <motion.div variants={fadeInUp} style={{textAlign:"center",marginBottom:20}}>
                        <div style={{fontSize:44,marginBottom:8}}>🌙</div>
                        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:"#7fffd4",marginBottom:6}}>Sleep Sounds</h2>
                        <p style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.45)",fontSize:14}}>Sounds crossfade smoothly at random while you sleep</p>
                      </motion.div>
                      {sleepError && (
                        <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16,border:"1px solid rgba(248,113,113,0.18)",background:"rgba(248,113,113,0.06)"}}>
                          <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(248,113,113,0.86)",lineHeight:1.5}}>{sleepError}</p>
                        </motion.div>
                      )}
                      <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                        <label style={labelStyle}>Duration</label>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {SLEEP_DURATIONS.map(d=>(<motion.button key={d.label} whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={()=>setSleepDuration(d.value)} style={{background:sleepDuration===d.value?"rgba(127,255,212,0.15)":"rgba(127,255,212,0.03)",border:`1px solid ${sleepDuration===d.value?"rgba(127,255,212,0.5)":"rgba(127,255,212,0.1)"}`,color:sleepDuration===d.value?"#7fffd4":"rgba(232,244,240,0.45)",borderRadius:20,padding:"9px 16px",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",fontSize:13,letterSpacing:1,transition:"all 0.2s"}}>{d.label}</motion.button>))}
                        </div>
                      </motion.div>
                      <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <label style={{...labelStyle,marginBottom:0}}>Sound Categories</label>
                          <button className="breatheos-btn-ghost" style={{fontSize:12,padding:"6px 12px"}} onClick={()=>{setSoundSearchTarget("sleep");setSoundSearchOpen(true);}}>Search</button>
                        </div>
                        <div className="breatheos-sleep-category-grid">
                          {SLEEP_CATEGORIES.map(cat=>{
                            const isSel = cat.sounds.every(id=>sleepSelectedSounds.includes(id));
                            return (<motion.button key={cat.name} whileHover={{scale:1.025}} whileTap={{scale:0.97}} onClick={()=>{ setSleepSelectedSoundIds(prev=>{ const s=new Set(prev); if (isSel) { cat.sounds.forEach(id=>s.delete(id)); } else { cat.sounds.forEach(id=>s.add(id)); } return Array.from(s); }); if(sleepPlaying)stopSleepSounds(); }} style={{background:isSel?"linear-gradient(135deg,rgba(127,255,212,0.12),rgba(135,206,235,0.08))":"rgba(127,255,212,0.03)",border:`1px solid ${isSel?"rgba(127,255,212,0.4)":"rgba(127,255,212,0.08)"}`,borderRadius:12,padding:"10px 12px",cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                              <span style={{fontSize:18}}>{cat.emoji}</span>
                              <div style={{textAlign:"left",minWidth:0}}><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:isSel?"#7fffd4":"rgba(232,244,240,0.5)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat.name}</div><div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:10,color:"rgba(232,244,240,0.25)"}}>{cat.sounds.length} sounds</div></div>
                            </motion.button>);
                          })}
                        </div>
                      </motion.div>
                      <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><label style={{...labelStyle,marginBottom:0}}>Volume</label><span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"#7fffd4"}}>{Math.round(sleepVolume*100)}%</span></div>
                        {renderSleepVolumeControl()}
                      </motion.div>
                      <motion.button variants={fadeInUp} whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn" style={{width:"100%",fontSize:17,padding:"20px",opacity:sleepSelectedSounds.length===0?0.35:1,marginBottom:24}} onClick={startSleepSounds}>▶ Start Sleep Sounds</motion.button>
                    </motion.div>
                  )}
                </>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ SETTINGS ══ */}
        <AnimatePresence mode="wait">
          {screen === "settings" && (
            <motion.div key="settings" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,padding:"28px 24px",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <motion.h2 variants={fadeInUp} style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:"#7fffd4",marginBottom:4}}>Session Settings</motion.h2>
                <motion.p variants={fadeInUp} style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.45)",fontSize:14,marginBottom:24}}>Fine-tune how sessions sound and feel</motion.p>

                <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                  <label style={labelStyle}>Breathing Pace</label>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {([["Clinical",1.0,"Faster count"],["Balanced",1.15,"Softer count"],["Gentle",1.3,"Slowest count"]] as const).map(([lbl,val,note])=>(
                      <motion.button key={lbl} whileHover={{scale:1.03}} whileTap={{scale:0.97}} onClick={()=>setCountCadenceMultiplier(val)} style={{background:countCadenceMultiplier===val?"rgba(127,255,212,0.15)":"rgba(127,255,212,0.03)",border:`1px solid ${countCadenceMultiplier===val?"rgba(127,255,212,0.5)":"rgba(127,255,212,0.1)"}`,color:countCadenceMultiplier===val?"#7fffd4":"rgba(232,244,240,0.5)",borderRadius:8,padding:"12px 10px",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",transition:"all 0.2s",textAlign:"center" as const}}>
                        <div style={{fontSize:14,marginBottom:3}}>{lbl}</div><div style={{fontSize:11,color:countCadenceMultiplier===val?"rgba(127,255,212,0.7)":"rgba(232,244,240,0.3)"}}>{note}</div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:10}}>
                    <div><label style={{...labelStyle,marginBottom:2}}>Session Sounds</label><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(232,244,240,0.4)"}}>{sessionSelectedSounds.length} selected · auto-rotate {sessionSoundAutoRotate?"on":"off"}</p></div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}><Switch checked={sessionSoundAutoRotate} onCheckedChange={setSessionSoundAutoRotate} /><button className="breatheos-btn-ghost" style={{fontSize:12,padding:"6px 10px"}} onClick={()=>{setSoundSearchTarget("session");setSoundSearchOpen(true);}}>+ Add</button></div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {sessionSelectedSounds.map(s=>(<span key={s.id} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(127,255,212,0.08)",border:"1px solid rgba(127,255,212,0.15)",borderRadius:20,padding:"5px 12px",fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(127,255,212,0.8)"}}>
                      {s.emoji} {s.name}
                      <button onClick={()=>setSessionSelectedSoundIds(p=>p.length>1?p.filter(id=>id!==s.id):p)} style={{background:"none",border:"none",color:"rgba(248,113,113,0.6)",cursor:"pointer",padding:0,fontSize:14,lineHeight:1}}>×</button>
                    </span>))}
                  </div>
                </motion.div>

                <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                    <div><Label style={{...labelStyle,marginBottom:2}}>Daily Reminders</Label><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:"rgba(232,244,240,0.4)",lineHeight:1.5}}>{remindersOn?"Random encouraging nudges are active":"Gentle reminders throughout the day"}</p></div>
                    <Switch checked={remindersOn} onCheckedChange={toggleReminders} />
                  </div>
                  {lastReminder && <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(127,255,212,0.35)",marginTop:8}}>Last sent: {lastReminder}</p>}
                </motion.div>

                <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                  <p style={labelStyle}>Sound On During Sessions</p>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.6)"}}>Play ambient sounds during breathing</p>
                    <Switch checked={soundOn} onCheckedChange={setSoundOn} />
                  </div>
                </motion.div>

                <motion.div variants={fadeInUp} style={{...glassCard,border:"1px solid rgba(248,113,113,0.12)"}}>
                  <p style={labelStyle}>Data & Privacy</p>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.6)",lineHeight:1.6,marginBottom:12}}>Profile, BP entries, and session history are stored locally on this device{authSession?.user?" and synced to your account":". Sign in to sync across devices"}.</p>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={handleExport} className="breatheos-btn-ghost" style={{fontSize:13}}>⬇ Export JSON</motion.button>
                    <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} onClick={clearAllLocalData} style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.18)",color:"rgba(248,113,113,0.82)",borderRadius:10,padding:"10px 12px",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",fontSize:13}}>Clear All Data</motion.button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ BREATHE TOGETHER ══ */}
        <AnimatePresence mode="wait">
          {screen === "together" && (
            <motion.div key="together" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{flex:1,padding:"28px 24px",overflowY:"auto"}} className="breatheos-scroll">
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <motion.div variants={fadeInUp} style={{textAlign:"center",marginBottom:28}}>
                  {/* FIX: 🫂 doesn't render on all platforms. Replaced with a
                      CSS glow circle matching the welcome/intro screen pattern. */}
                  <div style={{width:72,height:72,borderRadius:"50%",background:"radial-gradient(circle,rgba(127,255,212,0.15) 0%,transparent 70%)",border:"1px solid rgba(127,255,212,0.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:"0 0 32px rgba(127,255,212,0.08)"}}>
                    <span style={{fontSize:30,filter:"drop-shadow(0 0 10px rgba(127,255,212,0.7))"}}>💞</span>
                  </div>
                  <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:30,color:"#7fffd4",marginBottom:6}}>Breathe Together</h2>
                  <p style={{fontFamily:"'Cormorant Garamond',serif",color:"rgba(232,244,240,0.45)",fontSize:14,lineHeight:1.6}}>Sync your breathing session with another person in real time. Share a room ID and breathe together.</p>
                </motion.div>

                {!togetherConnected ? (
                  <motion.div variants={fadeInUp} style={{...glassCard,marginBottom:16}}>
                    <label style={labelStyle}>Room ID</label>
                    <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.45)",marginBottom:10,lineHeight:1.5}}>Create a room or enter a friend&apos;s room ID to join them.</p>
                    <input className="breatheos-input" placeholder="e.g. calm-river-42" value={togetherRoomInput} onChange={e=>setTogetherRoomInput(e.target.value)} style={{marginBottom:12}} />
                    <div style={{display:"flex",gap:8}}>
                      <motion.button
                        whileHover={{scale:togetherConnecting?1:1.02}}
                        whileTap={{scale:togetherConnecting?1:0.98}}
                        className="breatheos-btn"
                        style={{flex:1,opacity:togetherConnecting?0.7:1,transition:"opacity 0.2s"}}
                        disabled={togetherConnecting}
                        onClick={()=>{
                          if (togetherConnecting) return;
                          const id = togetherRoomInput.trim() || Math.random().toString(36).slice(2,8);
                          setTogetherRoomInput(id);
                          connectTogether(id);
                        }}>
                        {togetherConnecting ? "Connecting…" : "Join Room"}
                      </motion.button>
                      <motion.button
                        whileHover={{scale:togetherConnecting?1:1.02}}
                        whileTap={{scale:togetherConnecting?1:0.98}}
                        className="breatheos-btn-ghost"
                        disabled={togetherConnecting}
                        onClick={()=>{
                          if (togetherConnecting) return;
                          const id=Math.random().toString(36).slice(2,8);
                          setTogetherRoomInput(id);
                          connectTogether(id);
                        }}>
                        New Room
                      </motion.button>
                    </div>
                    {togetherError && (
                      <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(248,113,113,0.82)",lineHeight:1.5,marginTop:12}}>
                        {togetherError}
                      </p>
                    )}
                  </motion.div>
                ) : (
                  <motion.div variants={fadeInUp} initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} style={{...glassCard,marginBottom:16,border:"1px solid rgba(127,255,212,0.2)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div><p style={labelStyle}>Connected</p><p style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:"#7fffd4"}}>Room: {togetherRoomId}</p></div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:"#7fffd4",boxShadow:"0 0 8px #7fffd4",animation:"holdPulse 2s infinite"}} />
                        <button className="breatheos-btn-ghost" style={{fontSize:12}} onClick={disconnectTogether}>Leave</button>
                      </div>
                    </div>
                    <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.45)",marginBottom:12}}>Share this room ID with your partner. Once they join, start your session together.</p>
                    <button onClick={()=>navigator.clipboard.writeText(togetherRoomId)} className="breatheos-btn-ghost" style={{fontSize:12,width:"100%",textAlign:"center" as const,marginBottom:12}}>📋 Copy Room ID</button>

                    {togetherPeers.length === 0 ? (
                      <div style={{textAlign:"center",padding:20}}>
                        <div style={{animation:"holdPulse 2s infinite",display:"inline-block",width:40,height:40,borderRadius:"50%",border:"1px solid rgba(127,255,212,0.2)",marginBottom:10}} />
                        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.4)"}}>Waiting for your partner to join…</p>
                      </div>
                    ) : (
                      <div>
                        <p style={{...labelStyle,marginBottom:8}}>{togetherPeers.length} partner{togetherPeers.length>1?"s":""} in room</p>
                        {togetherPeers.map(peer=>{
                          const peerCfg = PHASE_CONFIG[peer.phase]??PHASE_CONFIG.rest;
                          return (<div key={peer.userId} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(127,255,212,0.06)"}}>
                            <div style={{width:44,height:44,borderRadius:"50%",border:`1px solid ${peerCfg.color}50`,background:`${peerCfg.color}10`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <span style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:peerCfg.color}}>{peer.count}</span>
                            </div>
                            <div><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:14,color:"rgba(232,244,240,0.8)"}}>{peer.userId}</p><p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:12,color:peerCfg.color}}>{peerCfg.label}</p></div>
                          </div>);
                        })}
                        <motion.button whileHover={{scale:1.02}} whileTap={{scale:0.98}} className="breatheos-btn" style={{width:"100%",marginTop:16}} onClick={startSession}>▶ Start Together Session</motion.button>
                      </div>
                    )}
                  </motion.div>
                )}

                <motion.div variants={fadeInUp} style={{...glassCard,marginTop:8}}>
                  <p style={labelStyle}>How it works</p>
                  {["Create or join a room with a shared ID","Your breathing circle syncs in real time with your partner","Both of you see each other's phase and count","Start a session from Dashboard or here — the server keeps you in sync"].map((t,i)=>(<p key={i} style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,color:"rgba(232,244,240,0.5)",lineHeight:1.6,marginBottom:4}}>{i+1}. {t}</p>))}
                  <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:11,color:"rgba(248,113,113,0.5)",marginTop:8,lineHeight:1.5}}>Requires the BreatheOS WebSocket server. Run npm run dev:full, or run npm run ws in a second terminal while npm run dev is running.</p>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {showNav && !isDesktop && <BottomNav screen={screen} sleepPlaying={sleepPlaying} stopSleepSounds={stopSleepSounds} setScreen={setScreen} />}
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&display=swap');
        * { box-sizing: border-box; }
        html, body {
          height:100%;
          overflow:hidden;
          overscroll-behavior:none;
        }
        body { -webkit-tap-highlight-color: transparent; }
        .breatheos-input { background:rgba(127,255,212,0.04); border:1px solid rgba(127,255,212,0.18); border-radius:8px; color:#e8f4f0; padding:12px 16px; font-family:'Cormorant Garamond',serif; font-size:16px; width:100%; outline:none; transition:border-color 0.25s,box-shadow 0.25s; backdrop-filter:blur(8px); -webkit-appearance:none; }
        .breatheos-input:focus { border-color:rgba(127,255,212,0.55); box-shadow:0 0 16px rgba(127,255,212,0.08); }
        .breatheos-input option { background:#0a1628; }
        .breatheos-input::-webkit-inner-spin-button, .breatheos-input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        .breatheos-input[type="number"] { -moz-appearance:textfield; }
        .breatheos-goal-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
        .breatheos-btn { background:linear-gradient(135deg,rgba(15,46,36,0.9),rgba(26,74,56,0.9)); border:1px solid rgba(127,255,212,0.25); color:#7fffd4; padding:14px 30px; border-radius:8px; cursor:pointer; font-family:'Cormorant Garamond',serif; font-size:15px; letter-spacing:2.5px; text-transform:uppercase; transition:all 0.25s; backdrop-filter:blur(8px); }
        .breatheos-btn:hover { background:linear-gradient(135deg,rgba(26,62,48,0.95),rgba(42,106,74,0.95)); box-shadow:0 0 28px rgba(127,255,212,0.25); }
        .breatheos-btn-ghost { background:rgba(127,255,212,0.03); border:1px solid rgba(127,255,212,0.15); color:rgba(127,255,212,0.6); padding:9px 22px; border-radius:40px; cursor:pointer; font-family:'Cormorant Garamond',serif; font-size:13px; letter-spacing:1.5px; transition:all 0.2s; backdrop-filter:blur(8px); }
        .breatheos-btn-ghost:hover, .breatheos-btn-ghost.on { border-color:rgba(127,255,212,0.5); color:#7fffd4; background:rgba(127,255,212,0.07); box-shadow:0 0 16px rgba(127,255,212,0.1); }
        .breatheos-scroll { scrollbar-width:thin; scrollbar-color:rgba(127,255,212,0.15) transparent; }
        .breatheos-scroll::-webkit-scrollbar { width:3px; }
        .breatheos-scroll::-webkit-scrollbar-thumb { background:rgba(127,255,212,0.15); border-radius:2px; }
        .breatheos-gradient-text { background:linear-gradient(135deg,#7fffd4,#87ceeb,#c084fc); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .breatheos-progress > div { background:linear-gradient(90deg,#1a4a3a,#7fffd4) !important; }
        .breatheos-volume-range {
          width:100%;
          min-width:0;
          height:28px;
          cursor:pointer;
          appearance:none;
          -webkit-appearance:none;
          background:transparent;
          outline:none;
        }
        .breatheos-volume-range::-webkit-slider-runnable-track {
          height:8px;
          border-radius:999px;
          border:1px solid rgba(127,255,212,0.12);
          background:linear-gradient(90deg,#7fffd4 0 var(--volume-progress), rgba(127,255,212,0.12) var(--volume-progress) 100%);
          box-shadow:inset 0 1px 2px rgba(0,0,0,0.45);
        }
        .breatheos-volume-range::-webkit-slider-thumb {
          appearance:none;
          -webkit-appearance:none;
          width:20px;
          height:20px;
          margin-top:-7px;
          border-radius:999px;
          border:2px solid rgba(127,255,212,0.95);
          background:#071522;
          box-shadow:0 0 0 4px rgba(127,255,212,0.08), 0 0 16px rgba(127,255,212,0.42);
        }
        .breatheos-volume-range::-moz-range-track {
          height:8px;
          border-radius:999px;
          border:1px solid rgba(127,255,212,0.12);
          background:rgba(127,255,212,0.12);
          box-shadow:inset 0 1px 2px rgba(0,0,0,0.45);
        }
        .breatheos-volume-range::-moz-range-progress {
          height:8px;
          border-radius:999px;
          background:linear-gradient(90deg,#7fffd4,#87ceeb);
        }
        .breatheos-volume-range::-moz-range-thumb {
          width:18px;
          height:18px;
          border-radius:999px;
          border:2px solid rgba(127,255,212,0.95);
          background:#071522;
          box-shadow:0 0 0 4px rgba(127,255,212,0.08), 0 0 16px rgba(127,255,212,0.42);
        }
        .breatheos-volume-range:focus-visible::-webkit-slider-thumb { box-shadow:0 0 0 5px rgba(127,255,212,0.18), 0 0 18px rgba(127,255,212,0.55); }
        .breatheos-volume-range:focus-visible::-moz-range-thumb { box-shadow:0 0 0 5px rgba(127,255,212,0.18), 0 0 18px rgba(127,255,212,0.55); }
        [data-radix-popper-content-wrapper] { z-index:300 !important; }
        @keyframes breatheos-gradient { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes particleFloat { 0%{transform:translateY(0) scale(1);opacity:0.1} 50%{opacity:0.25} 100%{transform:translateY(-100vh) scale(0);opacity:0} }
        @keyframes holdPulse { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.08);opacity:1} }
        @media (max-width:560px) { .breatheos-goal-grid { grid-template-columns:1fr; } }
        [cmdk-item]:hover { background:rgba(127,255,212,0.08) !important; }
        [cmdk-item][aria-selected=true] { background:rgba(127,255,212,0.12) !important; }
        [cmdk-input] { background:transparent; border:none; outline:none; }

        /* ── DayPicker — full reset. react-day-picker v8 wraps each day in a
           <td class="rdp-cell"> containing <button class="rdp-day_button ...">
           Modifier classes are applied to the button element. All border/
           outline/background must be zeroed on both .rdp-cell AND .rdp-day_button
           or the default browser button styles show as white bordered squares. */
        .rdp { margin:0; width:100% !important; }
        .rdp-months { width:100%; }
        .rdp-month { width:100%; }
        .rdp-table { width:100% !important; border-collapse:collapse; table-layout:fixed; }
        .rdp-caption { display:flex !important; align-items:center; justify-content:space-between; padding:0 4px 16px; }
        .rdp-caption_label { font-family:'Playfair Display',serif !important; font-size:20px !important; font-weight:400 !important; color:#7fffd4 !important; }
        .rdp-nav_button { background:none !important; border:none !important; outline:none !important; cursor:pointer; color:rgba(127,255,212,0.5) !important; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.2s; font-size:16px; }
        .rdp-nav_button:hover { background:rgba(127,255,212,0.08) !important; color:#7fffd4 !important; }
        .rdp-head_cell { font-family:'Cormorant Garamond',serif !important; font-size:10px !important; color:rgba(127,255,212,0.35) !important; letter-spacing:2px; text-transform:uppercase; padding-bottom:8px; font-weight:400 !important; text-align:center; width:auto; }
        .rdp-cell { text-align:center; padding:2px; border:none !important; background:none !important; }
        .rdp-day { border:none !important; outline:none !important; background:none !important; padding:0 !important; }
        .rdp-day_button, button.rdp-day_button { width:36px; height:36px; border-radius:50% !important; border:none !important; outline:none !important; background:transparent !important; color:rgba(232,244,240,0.55) !important; cursor:pointer; font-family:'Cormorant Garamond',serif !important; font-size:14px !important; display:inline-flex !important; align-items:center; justify-content:center; transition:background 0.18s,color 0.18s,box-shadow 0.18s; padding:0 !important; margin:0 auto; }
        .rdp-day_button:focus-visible { outline:none !important; box-shadow:0 0 0 2px rgba(127,255,212,0.5) !important; }
        .rdp-day_button:hover:not([disabled]):not(.rdp-day_complete):not(.rdp-day_partial):not(.rdp-day_missed) { background:rgba(127,255,212,0.07) !important; color:rgba(232,244,240,0.85) !important; }
        .rdp-day_today .rdp-day_button:not(.rdp-day_complete):not(.rdp-day_partial):not(.rdp-day_missed) { color:#7fffd4 !important; box-shadow:0 2px 0 0 rgba(127,255,212,0.6) !important; background:transparent !important; }
        .rdp-day_outside .rdp-day_button { color:rgba(232,244,240,0.18) !important; }
        .rdp-day_disabled .rdp-day_button { color:rgba(232,244,240,0.12) !important; cursor:default; }
        .rdp-day_complete .rdp-day_button { background:rgba(127,255,212,0.22) !important; color:#030b14 !important; font-weight:600 !important; box-shadow:none !important; }
        .rdp-day_partial  .rdp-day_button { background:rgba(251,191,36,0.85)  !important; color:#1a0e00 !important; box-shadow:none !important; }
        .rdp-day_missed   .rdp-day_button { background:rgba(248,113,113,0.75)  !important; color:#1a0000 !important; box-shadow:none !important; }
        .rdp-day_selected .rdp-day_button { box-shadow:0 0 0 2px rgba(127,255,212,0.8) !important; }

        /* FIX 1: Radix portal dialogs need explicit high z-index on mobile.
           tw-animate-css was removed so we can no longer rely on the Tailwind
           animate-in/fade-in classes to lift the overlay. These selectors target
           the data-slot attributes that shadcn stamps on its components. */
        [data-slot="alert-dialog-overlay"],
        [data-slot="dialog-overlay"] {
          z-index: 400 !important;
        }
        [data-slot="alert-dialog-content"],
        [data-slot="dialog-content"] {
          z-index: 401 !important;
        }
        /* FIX 1b: Framer Motion leaves transform: translateY(0px) on .motion.div
           after page-transition animations. On iOS WebKit a non-identity transform
           on a parent creates a compositing layer that can eat portaled fixed
           elements. Force the session screen to composite on the GPU via
           will-change so it doesn’t interfere with the dialog overlay. */
        [data-session-screen] {
          will-change: opacity;
          transform: none !important;
          filter: none !important;
        }

        /* ── Grain/noise overlay */
        .breatheos-grain {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          opacity: 0.035;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-repeat: repeat; background-size: 128px 128px;
        }
        /* ── Desktop layout */
        @media (min-width: 1200px) {
          .breatheos-desktop-content { max-width: none !important; margin: 0 !important; }
        }
        /* ── Tablet grid */
        @media (min-width: 768px) and (max-width: 1199px) {
          .breatheos-tablet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        }
        /* ── Button physics */
        .breatheos-btn:active { transform: scale(0.97); }
        .breatheos-btn-ghost:active { transform: scale(0.97); }
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(20px); filter: blur(4px); }
          to   { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}
