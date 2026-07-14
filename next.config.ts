import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const contentSecurityPolicy = ["default-src 'self'", "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""), "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:", "media-src 'self' blob:", "connect-src 'self'", "font-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"] .join("; ");
    return [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }, { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "DENY" }, { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }] }];
  },
};

export default nextConfig;
