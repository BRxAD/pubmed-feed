import { redirect } from "next/navigation";

/**
 * Dashboard retired (egress). Stats live on /feed (cached human-rating total).
 */
export default function DashboardRetiredPage() {
  redirect("/feed");
}
