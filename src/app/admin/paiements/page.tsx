import { Suspense } from "react";
import PaiementsClient from "./PaiementsClient";

export default function PaiementsPage() {
  return (
    <Suspense fallback={null}>
      <PaiementsClient />
    </Suspense>
  );
}
