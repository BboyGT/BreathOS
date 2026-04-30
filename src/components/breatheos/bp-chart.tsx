"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface BpEntry {
  date: string;
  s: number;
  d: number;
  day: number;
}

interface WeekMilestone {
  week: number;
  change: number;
  label: string;
  color: string;
}

interface BpChartProps {
  bpLog: BpEntry[];
  trainingDay: number;
  rec: {
    weeks: WeekMilestone[];
    maxReduction: number;
  } | null;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: "rgba(3, 11, 20, 0.95)",
          border: "1px solid rgba(127, 255, 212, 0.2)",
          borderRadius: 8,
          padding: "10px 14px",
          backdropFilter: "blur(12px)",
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 13,
          color: "#e8f4f0",
        }}
      >
        <p style={{ marginBottom: 4, color: "rgba(127, 255, 212, 0.5)", fontSize: 11, letterSpacing: 1 }}>
          Day {label}
        </p>
        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color, fontSize: 14, fontWeight: 500 }}>
            {entry.dataKey === "s" ? "Systolic" : "Diastolic"}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function BpChart({ bpLog, trainingDay, rec }: BpChartProps) {
  if (bpLog.length === 0) return null;

  // Build actual data points
  const actualData = bpLog.map((b) => ({
    day: `D${b.day}`,
    dayNum: b.day,
    s: b.s,
    d: b.d,
  }));

  // Build projected data points
  const projectedData: Array<{ day: string; dayNum: number; estS: number | null; estD: number | null }> = [];
  if (rec && bpLog.length > 0) {
    const lastDay = bpLog[bpLog.length - 1].day;
    const maxProjDay = Math.max(
      trainingDay + (rec.weeks[rec.weeks.length - 1]?.week * 7 || 84),
      84
    );

    // Add starting point
    projectedData.push({
      day: "D0",
      dayNum: 0,
      estS: bpLog[0].s,
      estD: bpLog[0].d,
    });

    for (const w of rec.weeks) {
      const dayNum = w.week * 7;
      if (dayNum > lastDay) {
        projectedData.push({
          day: `D${dayNum}`,
          dayNum,
          estS: bpLog[0].s - w.change,
          estD: bpLog[0].d - Math.round(w.change * 0.6),
        });
      }
    }
  }

  // Merge data for chart
  const mergedDays = new Map<number, { day: string; dayNum: number; s?: number; d?: number; estS?: number; estD?: number }>();

  for (const entry of actualData) {
    mergedDays.set(entry.dayNum, {
      day: entry.day,
      dayNum: entry.dayNum,
      s: entry.s,
      d: entry.d,
    });
  }
   for (const entry of projectedData) {
     const existing = mergedDays.get(entry.dayNum);
     if (existing) {
       existing.estS = entry.estS ?? undefined;
       existing.estD = entry.estD ?? undefined;
     } else {
       mergedDays.set(entry.dayNum, entry as typeof mergedDays extends Map<number, infer V> ? V : never);
     }
   }

  const chartData = Array.from(mergedDays.values()).sort((a, b) => a.dayNum - b.dayNum);

  // Determine axis range
  const allSystolic = chartData.map((d) => d.s ?? d.estS ?? 120).filter(Boolean);
  const allDiastolic = chartData.map((d) => d.d ?? d.estD ?? 80).filter(Boolean);
  const minBp = Math.min(...allDiastolic) - 10;
  const maxBp = Math.max(...allSystolic) + 10;

  return (
    <div
      style={{
        background: "rgba(127, 255, 212, 0.03)",
        border: "1px solid rgba(127, 255, 212, 0.1)",
        borderRadius: 12,
        padding: 20,
        backdropFilter: "blur(12px)",
        marginBottom: 20,
      }}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradSystolic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7fffd4" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#7fffd4" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="gradDiastolic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#87ceeb" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#87ceeb" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="gradEstSystolic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7fffd4" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#7fffd4" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="gradEstDiastolic" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#87ceeb" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#87ceeb" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(127, 255, 212, 0.06)"
            vertical={false}
          />

          <XAxis
            dataKey="day"
            tick={{ fill: "rgba(127, 255, 212, 0.35)", fontSize: 10, fontFamily: "'Cormorant Garamond', serif" }}
            axisLine={{ stroke: "rgba(127, 255, 212, 0.1)" }}
            tickLine={false}
          />

          <YAxis
            domain={[minBp, maxBp]}
            tick={{ fill: "rgba(127, 255, 212, 0.3)", fontSize: 10, fontFamily: "'Cormorant Garamond', serif" }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Reference lines for BP zones */}
          <ReferenceLine y={120} stroke="rgba(127, 255, 212, 0.08)" strokeDasharray="2 4" />
          <ReferenceLine y={140} stroke="rgba(248, 113, 113, 0.12)" strokeDasharray="2 4" />

          {/* Projected systolic area */}
          <Area
            type="monotone"
            dataKey="estS"
            stroke="rgba(127, 255, 212, 0.2)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            fill="url(#gradEstSystolic)"
            dot={false}
            connectNulls={false}
            name="estS"
          />

          {/* Projected diastolic area */}
          <Area
            type="monotone"
            dataKey="estD"
            stroke="rgba(135, 206, 235, 0.2)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            fill="url(#gradEstDiastolic)"
            dot={false}
            connectNulls={false}
            name="estD"
          />

          {/* Actual systolic area */}
          <Area
            type="monotone"
            dataKey="s"
            stroke="#7fffd4"
            strokeWidth={2.5}
            fill="url(#gradSystolic)"
            dot={{ r: 4, fill: "#7fffd4", stroke: "#030b14", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "#7fffd4", stroke: "#7fffd4", strokeWidth: 2 }}
            connectNulls={false}
            name="s"
          />

          {/* Actual diastolic area */}
          <Area
            type="monotone"
            dataKey="d"
            stroke="#87ceeb"
            strokeWidth={2.5}
            fill="url(#gradDiastolic)"
            dot={{ r: 4, fill: "#87ceeb", stroke: "#030b14", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "#87ceeb", stroke: "#87ceeb", strokeWidth: 2 }}
            connectNulls={false}
            name="d"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
        {[
          { color: "#7fffd4", label: "Systolic (actual)" },
          { color: "#87ceeb", label: "Diastolic (actual)" },
          { color: "rgba(127, 255, 212, 0.35)", label: "Projected (est.)", dash: true },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 20,
                height: 2,
                background: l.color,
                borderBottom: l.dash ? "2px dashed rgba(127, 255, 212, 0.35)" : "none",
                position: "relative",
              }}
            >
              {l.dash && (
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    borderTop: "2px dashed rgba(127, 255, 212, 0.35)",
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 12,
                color: "rgba(232, 244, 240, 0.5)",
              }}
            >
              {l.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
