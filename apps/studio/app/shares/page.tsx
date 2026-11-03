import type { Metadata } from "next";
import MyShares from "@/modules/share/MyShares";

export const metadata: Metadata = { title: "My Share Links · Flowcam Studio" };

export default function SharesPage() {
  return <MyShares />;
}
