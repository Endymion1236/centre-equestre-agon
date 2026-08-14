"use client";

import { AuthProvider } from "@/lib/auth-context";
import { VitrineProvider } from "@/hooks/useVitrineImages";
import { ThemeSaisonProvider } from "@/hooks/useThemeSaison";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <VitrineProvider>
        <ThemeSaisonProvider>
          {children}
        </ThemeSaisonProvider>
      </VitrineProvider>
    </AuthProvider>
  );
}
