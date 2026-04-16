"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Cette page sert le HTML du challenge équestre avec l'ID du challenge en paramètre URL
// Le HTML challenge est un fichier statique servi depuis /public/challenge-app.html
// On le charge dans un iframe en passant le paramètre ?id=

export default function ChallengeClientPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    import("firebase/auth").then(({ getAuth }) => {
      const user = getAuth().currentUser;
      if (user) user.getIdToken().then(t => setToken(t));
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

  if (!token) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif" }}>
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <iframe
      src={`/challenge-app.html?id=${encodeURIComponent(id)}#token=${encodeURIComponent(token)}`}
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      title="Challenge Équestre"
    />
  );
}
