import { BusIcon } from "@/components/NavIcons"
import { BUS_DRIVER_TRANSPORT_LABEL } from "@/lib/busDriver"

// "Bus driver" transport label in attendee lists (Iain, 2026-10-29). Shown
// against the event's resident bus driver instead of a bus/car/own-way tag.
export default function BusDriverTag({ style }) {
  return (
    <span title="Driving the community bus" style={{ marginLeft: 4, fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap", ...style }}>
      <BusIcon style={{ width: 12, height: 12, verticalAlign: "-1px", marginRight: 2 }} />
      {BUS_DRIVER_TRANSPORT_LABEL}
    </span>
  )
}
