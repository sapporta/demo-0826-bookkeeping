/**
 * The report one level up from a drilled-into one.
 *
 * A drill-down is only legible if each stop names the level above it, and the
 * address is the one the step down was built from, so going back up lands on
 * the same numbers rather than a near neighbour. Quiet by design: the screen's
 * own work is the report, not the trail.
 */
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function ReportTrail({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1 text-sap-data text-sap-muted no-underline hover:text-sap-emph"
    >
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Link>
  );
}
