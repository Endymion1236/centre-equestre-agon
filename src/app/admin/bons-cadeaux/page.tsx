"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui";
import { Ticket, Printer, Info } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

export default function BonsCadeauxPage() {
  const [bons, setBons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBons = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "bons-cadeaux"), orderBy("createdAt", "desc")));
      setBons(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch { /* collection vide ou index absent : liste vide */ }
    setLoading(false);
  };
  useEffect(() => { loadBons(); }, []);

  // Ouvre le visuel imprimable du bon AVEC son vrai code.
  const imprimerBon = async (b: any) => {
    const w = window.open("", "_blank"); // ouvert avant l'await (compat mobile)
    try {
      const res = await authFetch("/api/bon-cadeau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: b.code,
          recipientName: b.recipientName || "",
          amount: b.montant || 0,
          fromName: b.fromName || "",
          message: b.message || "",
          validUntil: b.validUntil || "",
        }),
      });
      const html = await res.text();
      if (w) { w.document.write(html); w.document.close(); }
    } catch { if (w) w.close(); }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="font-serif text-2xl font-bold text-blue-800 mb-1 flex items-center gap-2">
        <Ticket size={26} /> Bons cadeaux
      </h1>

      <Card padding="md" className="mb-4">
        <div className="flex items-start gap-2 font-body text-sm text-slate-600">
          <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <span>
            Pour <strong>vendre</strong> un bon : <strong>Paiements → Encaisser → « 🎁 Vendre un bon cadeau »</strong>.
            La recette est alors enregistrée et le code généré. Ici, tu retrouves tous les bons et tu peux
            <strong> réimprimer</strong> chacun (avec son code) pour le remettre ou l'envoyer.
          </span>
        </div>
      </Card>

      <Card padding="md">
        <h3 className="font-body text-base font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <Ticket size={18} /> Bons ({bons.length})
        </h3>
        {loading ? (
          <p className="font-body text-sm text-gray-400 italic">Chargement…</p>
        ) : bons.length === 0 ? (
          <p className="font-body text-sm text-gray-400 italic">Aucun bon pour l'instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="text-left text-gray-400 border-b border-blue-500/8">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Bénéficiaire</th>
                  <th className="py-2 pr-3 text-right">Montant</th>
                  <th className="py-2 pr-3 text-right">Solde</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {bons.map(b => {
                  const solde = typeof b.solde === "number" ? b.solde : (b.montant || 0);
                  const badge = b.statut === "utilise" ? "bg-gray-100 text-gray-500"
                    : b.statut === "expire" ? "bg-rose-100 text-rose-700"
                    : "bg-emerald-100 text-emerald-700";
                  return (
                    <tr key={b.id} className="border-b border-blue-500/5">
                      <td className="py-2 pr-3 font-mono font-semibold text-blue-800">{b.code}</td>
                      <td className="py-2 pr-3 text-gray-600">{b.recipientName || "—"}</td>
                      <td className="py-2 pr-3 text-right">{(b.montant || 0).toFixed(2)}€</td>
                      <td className="py-2 pr-3 text-right font-semibold">{solde.toFixed(2)}€</td>
                      <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge}`}>{b.statut || "actif"}</span></td>
                      <td className="py-2 text-right">
                        <button onClick={() => imprimerBon(b)} title="Imprimer / voir le bon avec son code"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300">
                          <Printer size={14} /> Imprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
