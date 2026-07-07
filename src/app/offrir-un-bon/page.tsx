"use client";
import { useState, useEffect } from "react";

const PRESETS = [30, 50, 100, 150];

export default function OffrirUnBonPage() {
  const [montant, setMontant] = useState<string>("50");
  const [beneficiaire, setBeneficiaire] = useState("");
  const [message, setMessage] = useState("");
  const [acheteurNom, setAcheteurNom] = useState("");
  const [acheteurEmail, setAcheteurEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cancelled")) {
      setErreur("Le paiement a été annulé ou n'a pas abouti. Aucun montant n'a été débité.");
    }
  }, []);

  const inp = "w-full px-4 py-3 rounded-xl border border-blue-900/10 bg-white font-body text-sm focus:outline-none focus:border-blue-500";

  const payer = async () => {
    setErreur("");
    const m = parseFloat(montant.replace(",", "."));
    if (!m || m < 10 || m > 500) { setErreur("Le montant doit être compris entre 10 € et 500 €."); return; }
    if (!acheteurEmail.includes("@")) { setErreur("Indique un email valide pour recevoir le bon."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/bon-cadeau/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montant: m, beneficiaire, message, acheteurNom, acheteurEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        setErreur(data.error || "Le paiement est momentanément indisponible. Réessaie dans un instant.");
        setBusy(false);
        return;
      }
      // Redirection vers la page de paiement sécurisée CAWL.
      window.location.href = data.redirectUrl;
    } catch {
      setErreur("Une erreur est survenue. Réessaie dans un instant.");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎁</div>
          <h1 className="font-serif text-3xl font-bold text-blue-900 mb-2">Offrez un bon cadeau</h1>
          <p className="font-body text-sm text-slate-600">
            Faites plaisir avec un bon cadeau du Centre Équestre d'Agon-Coutainville :
            baptême, cours, stage, balade… Le bénéficiaire choisit ce qui lui plaît.
            Vous recevez le bon par email, à offrir ou à imprimer.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-blue-900/5 p-6">
          <label className="block font-body text-sm font-semibold text-blue-900 mb-2">Montant</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESETS.map(p => (
              <button key={p} onClick={() => setMontant(String(p))}
                className={`px-4 py-2 rounded-xl font-body text-sm font-semibold border cursor-pointer ${montant === String(p) ? "bg-blue-500 text-white border-blue-500" : "bg-white text-blue-900 border-blue-900/10"}`}>
                {p} €
              </button>
            ))}
          </div>
          <div className="relative mb-5">
            <input type="number" min={10} max={500} value={montant} onChange={e => setMontant(e.target.value)}
              placeholder="Montant libre" className={inp + " pr-8"} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-body text-sm">€</span>
          </div>

          <label className="block font-body text-sm font-semibold text-blue-900 mb-2">Bénéficiaire (optionnel)</label>
          <input value={beneficiaire} onChange={e => setBeneficiaire(e.target.value)} placeholder="Prénom de la personne à qui vous offrez" className={inp + " mb-5"} />

          <label className="block font-body text-sm font-semibold text-blue-900 mb-2">Message (optionnel)</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Joyeux anniversaire !" rows={3} className={inp + " mb-5 resize-none"} />

          <div className="border-t border-blue-900/8 pt-5 mb-5">
            <label className="block font-body text-sm font-semibold text-blue-900 mb-2">Votre nom</label>
            <input value={acheteurNom} onChange={e => setAcheteurNom(e.target.value)} placeholder="Nom de l'acheteur" className={inp + " mb-4"} />
            <label className="block font-body text-sm font-semibold text-blue-900 mb-2">Votre email</label>
            <input type="email" value={acheteurEmail} onChange={e => setAcheteurEmail(e.target.value)} placeholder="Pour recevoir le bon" className={inp} />
          </div>

          {erreur && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 font-body text-sm text-amber-800">{erreur}</div>}

          <button onClick={payer} disabled={busy}
            className="w-full py-4 rounded-xl font-body text-base font-bold text-white bg-emerald-600 border-none cursor-pointer hover:bg-emerald-500 disabled:opacity-50">
            {busy ? "…" : `Payer ${montant || "—"} € par carte`}
          </button>
          <p className="text-center font-body text-xs text-slate-400 mt-3">Paiement sécurisé par carte bancaire (Crédit Agricole).</p>
        </div>

        <div className="mt-6 font-body text-xs text-slate-500 text-center">
          Comment ça marche : vous payez → vous recevez le bon et son code par email → le bénéficiaire le présente au centre (ou l'utilise lors d'un paiement).
        </div>
      </div>
    </main>
  );
}
