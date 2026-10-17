import { ImageResponse } from "next/og";
import { features, featureBySlug } from "@/lib/features";

export const alt = "Flowcam feature";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headline = featureBySlug(slug)?.headline ?? "Flowcam";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#e8f4fd", padding: 72, color: "#0f172a" }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#16a34a" }}>Flowcam</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>{headline}</div>
        <div style={{ fontSize: 32, color: "#475569" }}>Launching soon · Join the waitlist</div>
      </div>
    ),
    { ...size },
  );
}
