"use client";

import type { ReactNode } from "react";
import PageLoader from "@/components/PageLoader";

export default function HomeShell({ children }: { children: ReactNode }) {
  return <PageLoader minMs={1200}>{children}</PageLoader>;
}
