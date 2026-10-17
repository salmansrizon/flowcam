import type { Metadata } from "next";
import { Recorder } from "@/modules/recording/Recorder";

export const metadata: Metadata = {
  title: "Record · Flowcam Studio",
};

export default function RecordPage() {
  return <Recorder />;
}
