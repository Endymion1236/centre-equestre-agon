"use client";

import { AuthProvider } from "@/lib/auth-context";
import { VitrineProvider } from "@/hooks/useVitrineImages";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <VitrineProvider>
        {children}
      </VitrineProvider>
    </AuthProvider>
  );
}
