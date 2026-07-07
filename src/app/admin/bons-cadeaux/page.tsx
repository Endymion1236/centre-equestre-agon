"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui";
import { Gift, Printer, Eye, Ticket } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";

export default function BonsCadeauxPage() {
  const [form, setForm] = useState({ recipientName: "", activity: "", amount: "", fromName: "", message: "", validUntil: "" });
  const [previewHtml, setPreviewHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [bons, setBons] = useState<any[]>([]);
  const [createdCode, setCreatedCode] = useState("");
  const u = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  const loadBons = async () => {
    try {
      const snap = await getDocs(query(collection(db, "bons-cadeaux"), orderBy("createdAt", "desc")));
      setBons(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch { /* collection vide ou index absent : liste vide */ }
  };
  useEffect(() => { loadBons(); }, []);

  // Code unique lisible, ex. BON-4KZ7QA
  const genCode = () => "BON-" + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase();

  const handleCreate = async () => {
    const montant = parseFloat(form.amount);
    if (!montant || montant <= 0) { alert("Indique un montant valide (€)."); return; }
    setSaving(true); setCreatedCode("");
    try {
      const code = genCode();
      await addDoc(collection(db, "bons-cadeaux"), {
        code, montant, solde: montant, statut: "actif",
        recipientName: form.recipientName.trim(),
        fromName: form.fromName.trim(),
        activity: form.activity.trim(),
        message: form.message.trim(),
        validUntil: form.validUntil || null,
        source: "admin",
        createdAt: serverTimestamp(),
      });
      setCreatedCode(code);
      await loadBons();
    } catch (e: any) { alert("Erreur : " + (e?.message || e)); }
    setSaving(false);
  };

  const handlePreview = async () => {
    const res = await authFetch("/api/bon-cadeau", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setPreviewHtml(await res.text());
  };
  const handlePrint = () => { const w = window.open("","_blank"); if(w){w.document.write(previewHtml);w.document.close();w.print();} };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6 flex items-center gap-3"><Gift size={24}/> Bons cadeaux</h1>
      <Card padding="md">
        <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Générer un bon cadeau</h3>
        <div className="flex flex-col gap-4">
          <div className="flex gap-3"><div className="flex-1"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Destinataire</label><input value={form.recipientName} onChange={e=>u("recipientName",e.target.value)} placeholder="Nom" className={inp}/></div><div className="flex-1"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">De la part de</label><input value={form.fromName} onChange={e=>u("fromName",e.target.value)} placeholder="Acheteur" className={inp}/></div></div>
          <div className="flex gap-3"><div className="flex-1"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Activité</label><select value={form.activity} onChange={e=>u("activity",e.target.value)} className={inp}><option value="">Montant libre</option><option value="Balade coucher de soleil">Balade coucher de soleil — 57€</option><option value="Promenade romantique">Romantique — 250€</option><option value="Stage vacances">Stage vacances — 175€</option><option value="Anniversaire">Anniversaire</option></select></div><div className="w-28"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Montant €</label><input type="number" value={form.amount} onChange={e=>u("amount",e.target.value)} placeholder="57" className={inp}/></div></div>
          <div><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Message</label><textarea value={form.message} onChange={e=>u("message",e.target.value)} rows={2} placeholder="Joyeux anniversaire !" className={`${inp} resize-y`}/></div>
          <div className="w-48"><label className="font-body text-xs font-semibold text-blue-800 block mb-1">Valable jusqu&apos;au</label><input type="date" value={form.validUntil} onChange={e=>u("validUntil",e.target.value)} className={inp}/></div>
          <div className="flex gap-3">
            <button onClick={handlePreview} className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-400"><Eye size={16}/> Aperçu</button>
            <button onClick={handleCreate} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-emerald-600 border-none cursor-pointer hover:bg-emerald-500 disabled:opacity-50"><Ticket size={16}/> {saving ? "..." : "Créer le bon"}</button>
            {previewHtml && <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300"><Printer size={16}/> Imprimer</button>}
          </div>
        </div>
      </Card>

      {createdCode && (
        <Card padding="md" className="mt-4">
          <div className="font-body text-sm text-emerald-700">
            ✅ Bon créé. Code : <span className="font-mono font-bold text-base">{createdCode}</span>
            <span className="text-gray-400"> — à transmettre au bénéficiaire (l'application sur un paiement viendra à l'étape suivante).</span>
          </div>
        </Card>
      )}

      <Card padding="md" className="mt-4">
        <h3 className="font-body text-base font-semibold text-blue-800 mb-3 flex items-center gap-2"><Ticket size={18}/> Bons créés ({bons.length})</h3>
        {bons.length === 0 ? (
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
                  <th className="py-2 pr-3">Validité</th>
                  <th className="py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {bons.map(b => {
                  const solde = typeof b.solde === "number" ? b.solde : b.montant || 0;
                  const badge = b.statut === "utilise" ? "bg-gray-100 text-gray-500"
                    : b.statut === "expire" ? "bg-rose-100 text-rose-700"
                    : "bg-emerald-100 text-emerald-700";
                  return (
                    <tr key={b.id} className="border-b border-blue-500/5">
                      <td className="py-2 pr-3 font-mono font-semibold text-blue-800">{b.code}</td>
                      <td className="py-2 pr-3 text-gray-600">{b.recipientName || "—"}</td>
                      <td className="py-2 pr-3 text-right">{(b.montant || 0).toFixed(2)}€</td>
                      <td className="py-2 pr-3 text-right font-semibold">{solde.toFixed(2)}€</td>
                      <td className="py-2 pr-3 text-gray-500">{b.validUntil || "—"}</td>
                      <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge}`}>{b.statut || "actif"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {previewHtml && <Card padding="sm" className="mt-4"><div className="font-body text-xs font-semibold text-gray-400 mb-2">Aperçu</div><div className="rounded-lg overflow-hidden border border-blue-500/8" style={{transform:"scale(0.55)",transformOrigin:"top left",width:"182%",height:260}}><iframe srcDoc={previewHtml} style={{width:"100%",height:500,border:"none"}}/></div></Card>}
    </div>
  );
}
