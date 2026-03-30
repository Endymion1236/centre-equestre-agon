"use client";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

export default function GetTokenPage() {
  const { user, isAdmin } = useAuth();
  const [token, setToken] = useState("");

  useEffect(() => {
    if (user) {
      user.getIdToken(true).then(setToken);
    }
  }, [user]);

  if (!isAdmin) return <div style={{padding:"2rem"}}>Non autorisé</div>;

  return (
    <div style={{padding:"2rem", fontFamily:"monospace"}}>
      <h2 style={{marginBottom:"1rem"}}>🔑 Firebase ID Token</h2>
      <p style={{marginBottom:"0.5rem", fontSize:"0.8rem", color:"#666"}}>
        Copie ce token pour les tests Playwright (.env.local → TEST_ADMIN_TOKEN)
      </p>
      <textarea
        readOnly
        value={token}
        onClick={e => (e.target as HTMLTextAreaElement).select()}
        style={{
          width:"100%", height:"200px", fontSize:"0.7rem",
          fontFamily:"monospace", padding:"1rem",
          border:"1px solid #ccc", borderRadius:"8px",
          background:"#f5f5f5"
        }}
      />
      <p style={{marginTop:"1rem", fontSize:"0.75rem", color:"#e55"}}>
        ⚠️ Token valide 1h — ne pas partager. Page réservée aux admins.
      </p>
    </div>
  );
}
