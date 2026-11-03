import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Docker: emit the self-contained server for the multi-stage Dockerfile. */
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
