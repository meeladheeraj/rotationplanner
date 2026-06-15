/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @rp/engine is a workspace TS package consumed from source.
  transpilePackages: ["@rp/engine"],
};

export default nextConfig;
