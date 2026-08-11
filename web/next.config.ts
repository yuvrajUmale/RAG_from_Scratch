import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These pull in native bindings (LanceDB's Rust addon, ONNX runtime for
  // @xenova/transformers) -- keep them as real `require()`s resolved from
  // node_modules at runtime instead of letting webpack try to bundle them.
  serverExternalPackages: ["@lancedb/lancedb", "@xenova/transformers", "onnxruntime-node"],
  // Rag/src (via the @rag/* alias) lives one level up from this app, so the
  // workspace root has to include rag/, not just rag/web/ -- pin it
  // explicitly instead of relying on Next's lockfile-based auto-detection
  // (which guesses right here, but only by accident).
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
