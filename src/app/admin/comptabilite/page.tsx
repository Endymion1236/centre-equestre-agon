import { Suspense } from "react";
import ComptabiliteClient from "./ComptabiliteClient";

export default function ComptabilitePage() {
  return (
    <Suspense fallback={null}>
      <ComptabiliteClient />
    </Suspense>
  );
}
