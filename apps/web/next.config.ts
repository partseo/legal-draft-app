import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["korean-law-mcp", "pdfjs-dist", "kordoc", "@xmldom/xmldom"],
};

export default nextConfig;
