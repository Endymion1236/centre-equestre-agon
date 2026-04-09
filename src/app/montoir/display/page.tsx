import { Suspense } from "react";
import MontiorDisplayClient from "./MontiorDisplayClient";

export default function MontiorDisplayPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0C1A2E", color: "#fff", fontFamily: "sans-serif", fontSize: "24px" }}>
        ⏳ Chargement...
      </div>
    }>
      <MontiorDisplayClient />
    </Suspense>
  );
}
