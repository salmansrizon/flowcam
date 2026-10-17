import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@flowcam/domain", "@flowcam/renderer"],
};

export default nextConfig;
