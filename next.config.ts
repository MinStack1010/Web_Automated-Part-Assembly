import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    proxyTimeout: 120000, 
    middlewareClientMaxBodySize: "50mb",
  },
  async rewrites() {
    return [
      {
        // Bất kỳ request nào bắt đầu bằng /backend/...
        source: '/backend/:path*',
        // Sẽ được Next.js ngầm gọi sang Docker ở port 8000
        destination: 'https://automated-part-assembly-911218714377.asia-southeast1.run.app/:path*', 
      },
    ]
  },
}

export default nextConfig;
