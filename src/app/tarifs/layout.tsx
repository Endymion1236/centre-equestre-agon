import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/tarifs" },
};

export default function TarifsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
