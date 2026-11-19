/** @type {import('next').NextConfig} */
const apiProxyTarget =
  process.env.API_PROXY_TARGET?.replace(/\/$/, "") || "http://localhost:5069";

const nextConfig = {
  async rewrites() {
    // Same-origin /api proxy so HttpOnly auth cookies work on localhost:3000.
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
