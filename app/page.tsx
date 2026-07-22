import { redirect } from "next/navigation";

/** Homepage → The Stewardship Brief */
export default function Home() {
  redirect("/stewardshipbrief");
}
