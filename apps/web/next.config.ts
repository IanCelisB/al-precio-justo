import type { NextConfig } from "next";

const config: NextConfig = {
  // El motor de valoración se comparte como código TypeScript sin compilar.
  transpilePackages: ["@ancla/valoracion"],
};

export default config;
