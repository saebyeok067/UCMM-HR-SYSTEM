/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/hr.html",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self)" },
          { key: "Cache-Control", value: "no-store, max-age=0" }
        ]
      }
    ];
  }
};

export default nextConfig;
