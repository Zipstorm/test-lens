import type { NextConfig } from "next";

// In Docker: BACKEND_URL=http://backend:3000 (service name)
// Locally:   defaults to http://localhost:3000
const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
