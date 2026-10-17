import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Private LAN addresses of this machine. `next dev` only trusts localhost by default, so a phone
 * opening a "View in AR" link at the laptop's Wi-Fi address would never finish loading. Dev only.
 */
function lanDevOrigins(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a!.address)
    .filter((ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));
}

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: lanDevOrigins(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
