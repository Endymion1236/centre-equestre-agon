"use client";

// ─────────────────────────────────────────────────────────────────────────
//  Page d'atterrissage du lien magique (email link sign-in)
// ─────────────────────────────────────────────────────────────────────────
// Cette page consomme un lien magique Firebase Auth envoye par email a une
// famille. Le lien contient un token a usage unique qui permet de se
// connecter sans mot de passe.
//
// Pattern Firebase (sendSignInLinkToEmail / signInWithEmailLink) :
//   1. Cote serveur on a appele generateSignInWithEmailLink avec l'email
//      cible et une URL de redirection -> /connexion-magique
//   2. Famille recoit l'email avec ce lien, clique
//   3. Atterrit ici, on detecte que c'est un lien magique
//   4. On demande a la famille de confirmer son email (mesure anti-phishing
//      Firebase : si quelqu'un d'autre forwarde le lien, il ne suffit pas
//      d'avoir l'URL, il faut aussi connaitre l'email cible)
//   5. signInWithEmailLink -> connexion reussie -> redirect espace cavalier
//
// La famille n'a JAMAIS de mot de passe a retenir avec ce flow. On peut
// renvoyer un autre lien plus tard si elle perd l'acces.

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailLink, isSignInWithEmailLink } from "firebase/auth";
import { auth } from "@/lib/firebase";

// Wrapper Suspense exige par Next 15 quand on utilise useSearchParams
// dans un composant qui peut etre pre-rendu (SSG).
export default function ConnexionMagiquePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-amber-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConnexionMagiqueContent />
    </Suspense>
  );
}

function ConnexionMagiqueContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [status, setStatus] = useState<"verifying" | "needEmail" | "connecting" | "success" | "error">("verifying");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Au montage : verifier que l'URL est bien un lien magique Firebase
  useEffect(() => {
    const url = window.location.href;
    if (!isSignInWithEmailLink(auth, url)) {
      setStatus("error");
      setErrorMsg("Ce lien n'est pas valide ou a expiré. Demande un nouveau lien à l'équipe du centre équestre.");
      return;
    }

    // Firebase peut avoir mis l'email en localStorage si la famille a clique
    // sur le lien depuis le MEME appareil ou elle a recu l'email.
    const storedEmail = window.localStorage.getItem("emailForSignIn");
    if (storedEmail) {
      // Pas besoin de redemander : on enchaine direct la connexion
      connectWithEmail(storedEmail, url);
    } else {
      // Famille a probablement clique depuis un autre appareil que celui
      // de reception (ex: mail recu sur PC, clic sur telephone) -> on
      // doit redemander l'email pour confirmer l'identite.
      setStatus("needEmail");
      // Pre-remplir si on a l'email dans l'URL (envoye en parametre par
      // l'admin pour faciliter, mais pas obligatoire)
      const urlEmail = params.get("email");
      if (urlEmail) setEmail(urlEmail);
    }
  }, [params]);

  const connectWithEmail = async (emailToUse: string, url: string) => {
    setStatus("connecting");
    try {
      await signInWithEmailLink(auth, emailToUse, url);
      // Nettoyer le localStorage
      window.localStorage.removeItem("emailForSignIn");
      setStatus("success");
      // Redirection vers espace cavalier apres 1.5s
      setTimeout(() => {
        router.push("/espace-cavalier");
      }, 1500);
    } catch (err: any) {
      console.error("Erreur signInWithEmailLink:", err);
      setStatus("error");
      if (err.code === "auth/invalid-email") {
        setErrorMsg("L'email saisi ne correspond pas au lien recu. Verifie que tu utilises bien la meme adresse email que celle qui a recu le lien.");
      } else if (err.code === "auth/invalid-action-code") {
        setErrorMsg("Ce lien a deja ete utilise ou a expire. Demande un nouveau lien a l'equipe du centre equestre.");
      } else {
        setErrorMsg(`Erreur de connexion : ${err.message || "inconnue"}. Reessaie ou contacte l'equipe du centre equestre.`);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setErrorMsg("Email invalide");
      return;
    }
    setErrorMsg("");
    connectWithEmail(email, window.location.href);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-amber-50">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-blue-100 flex items-center justify-center">
            <span className="text-3xl">🐴</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Centre Équestre Agon
          </h1>
          <p className="font-body text-sm text-slate-600 mt-1">
            Activation de ton espace famille
          </p>
        </div>

        {status === "verifying" && (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="font-body text-sm text-slate-600">Vérification du lien...</p>
          </div>
        )}

        {status === "needEmail" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-body text-sm font-semibold text-slate-700 mb-2">
                Confirme ton adresse email
              </label>
              <p className="font-body text-xs text-slate-500 mb-3 leading-relaxed">
                Pour des raisons de sécurité, merci de saisir l'adresse email
                sur laquelle tu as reçu ce lien.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton.email@exemple.fr"
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 outline-none font-body"
                required
                autoFocus
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 font-body text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-body font-semibold transition-colors"
            >
              Activer mon espace
            </button>
          </form>
        )}

        {status === "connecting" && (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="font-body text-sm text-slate-600">Connexion en cours...</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-3xl">✓</span>
            </div>
            <p className="font-body font-semibold text-slate-900 mb-1">
              Connexion réussie !
            </p>
            <p className="font-body text-sm text-slate-600">
              Redirection vers ton espace...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="font-body text-sm text-red-700 leading-relaxed">
                {errorMsg}
              </p>
            </div>
            <a
              href="/"
              className="block text-center py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-body font-semibold transition-colors"
            >
              Retour à l'accueil
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
