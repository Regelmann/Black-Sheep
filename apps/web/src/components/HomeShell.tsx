"use client";

import type { ReactNode } from "react";
import PageLoader from "@/components/PageLoader";
import GsapScroll from "@/components/GsapScroll";

export default function HomeShell({ children }: { children: ReactNode }) {
  return (
    <PageLoader minMs={1800}>
      <GsapScroll />
      {children}
    </PageLoader>
  );
}
