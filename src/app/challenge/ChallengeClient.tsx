"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Cette page sert le HTML du challenge équestre avec l'ID du challenge en paramètre URL
// Le HTML challenge est un fichier statique servi depuis /public/challenge-app.html
// On le charge dans un iframe en passant le paramètre ?id=

export default function ChallengeClientPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
      const auth = getAuth();
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const t = await user.getIdToken();
          setToken(t);
        }
        setAuthReady(true);
        unsub();
      });
      // Timeout: si l'auth ne répond pas en 3s, continuer sans token
      setTimeout(() => setAuthReady(true), 3000);
    });
  }, []);

  if (!id) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: "16px", fontFamily: "sans-serif", background: "#F5F0E8", color: "#3A5A3E" }}>
        <div style={{ fontSize: "48px" }}>🏇</div>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Challenge Équestre</h1>
        <p style={{ color: "#8B7D6B", textAlign: "center", maxWidth: "300px" }}>Aucun challenge sélectionné. Ouvrez ce challenge depuis l&apos;onglet Compétitions.</p>
        <a href="/admin/competitions" style={{ background: "#3A5A3E", color: "#fff", padding: "10px 20px", borderRadius: "10px", textDecoration: "none", fontWeight: 600, fontSize: "14px" }}>← Retour aux compétitions</a>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif" }}>
        <div>Chargement...</div>
      </div>
    );
  }

  const iframeSrc = token
    ? `/challenge-app.html?id=${encodeURIComponent(id)}#token=${encodeURIComponent(token)}`
    : `/challenge-app.html?id=${encodeURIComponent(id)}`;

  return (
    <iframe
      src={iframeSrc}
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      title="Challenge Équestre"
    />
  );
}
