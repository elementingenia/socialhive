"use client"
import { isBookingOptional, comingLabel, bookedLabel } from "@/lib/bookingMode"

// Shown instead of the seats bar on an event with no seat limit (Iain,
// 2026-10-31): "3 coming" for an optional event, "12 booked · no limit"
// for a no-limit one.
export default function ComingCount({ event, booked, style }) {
  return (
    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-dim)", margin: "0.35rem 0", ...style }}>
      👥 {isBookingOptional(event) ? comingLabel(booked) : bookedLabel(booked)}
    </div>
  )
}
