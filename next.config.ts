import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/vao/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
      {
        source: "/vao/releases/:release/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/vao/:path(.*\\.vao)",
        headers: [{ key: "Content-Type", value: "application/vnd.modavis.vao+zip" }],
      },
    ];
  },
};

export default nextConfig;
