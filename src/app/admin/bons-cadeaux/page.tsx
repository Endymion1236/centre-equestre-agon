"use client";
import { useState } from "react";
import { Card } from "@/components/ui";
import { Gift, Printer, Eye } from "lucide-react";

export default function BonsCadeauxPage() {
  const [form, setForm] = useState({ recipientName: "", activity: "", amount: "", fromName: "", message: "", validUntil: "" });
  const [previewHtml, setPreviewHtml] = useState("");
  const u = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  const handlePreview = async () => {
    const res = await fetch("/api/bon-cadeau", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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
            {previewHtml && <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300"><Printer size={16}/> Imprimer</button>}
          </div>
        </div>
      </Card>
      {previewHtml && <Card padding="sm" className="mt-4"><div className="font-body text-xs font-semibold text-gray-400 mb-2">Aperçu</div><div className="rounded-lg overflow-hidden border border-blue-500/8" style={{transform:"scale(0.55)",transformOrigin:"top left",width:"182%",height:260}}><iframe srcDoc={previewHtml} style={{width:"100%",height:500,border:"none"}}/></div></Card>}
    </div>
  );
}
