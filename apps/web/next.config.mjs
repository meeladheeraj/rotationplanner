/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @rp/engine is a workspace TS package consumed from source.
  transpilePackages: ["@rp/engine"],
  // Keep node-only DB packages external so webpack doesn't try to bundle their
  // node built-in deps (net/tls/fs). `postgres` (postgres-js) is the live driver;
  // pglite is the E2E_PGLITE in-process driver whose wasm `import.meta.url`
  // resolution also breaks if bundled.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // instrumentation.ts is compiled for EVERY runtime (incl. edge). Its db/pglite
  // code only runs under the nodejs runtime (register() bails early otherwise),
  // but webpack still tries to bundle postgres → node:net/tls on the edge build
  // and fails. serverExternalPackages only covers the node server runtime, so
  // for any non-node runtime we mark these node-only packages as externals to
  // stop webpack from resolving their node built-in deps.
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime !== "nodejs") {
      config.externals = config.externals || [];
      config.externals.push({
        postgres: "commonjs postgres",
        "@electric-sql/pglite": "commonjs @electric-sql/pglite",
      });
    }
    return config;
  },
};

export default nextConfig;
