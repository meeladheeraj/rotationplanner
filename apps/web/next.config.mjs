/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @rp/engine is a workspace TS package consumed from source.
  transpilePackages: ["@rp/engine"],
  // pglite is only used by instrumentation.ts under E2E_PGLITE; keep it external
  // so its internal wasm `import.meta.url` resolution isn't broken by bundling.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
