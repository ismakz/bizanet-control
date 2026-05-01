/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["routeros-client", "node-routeros"],
  },
  webpack: (config) => {
    const path = require("path");
    config.resolve.alias["@"] = path.join(__dirname, "src");
    return config;
  }
};

module.exports = nextConfig;

