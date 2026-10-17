import type { MetadataRoute } from "next";
import { features } from "@/lib/features";

const base = "https://getflowcam.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [base, ...features.map((f) => `${base}/features/${f.slug}`)].map((url) => ({ url }));
}
