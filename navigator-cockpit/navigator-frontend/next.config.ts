import type { NextConfig } from "next";
import { devIndicatorServerState } from "next/dist/server/dev/dev-indicator-server-state";

const nextConfig: NextConfig = {
  devIndicators: false
};

export default nextConfig;
