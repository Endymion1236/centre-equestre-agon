"use client";
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import type { Equide, DocumentEquide } from "../types";

export default function TabDocuments({
  equides, documents, onRefresh,
}: { equides: Equide[]; documents: DocumentEquide[]; onRefresh: () => void }) {
  const [equideId, setEquideId] = useState("");
  const [type, setType] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [date, setDate] = useState("");

  const inputStyle = "px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:outline-none focus:border-blue-400";

  const handleAdd = async () => {
    if (!equideId || !type || !label) return;
    await addDoc(collection(db, "documents_equide"), {
      equideId, equideName: equides.find(e => e.id === equideId)?.name || "",
      type, label, url: url || "",
      date: date || new Date().toISOString().split("T")[0],
      uploadedAt: serverTimestamp(),
    });
    setEquideId(""); setType(""); setLabel(""); setUrl(""); setDate("");
    onRefresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md" className="bg-blue-50 border-blue-500/8">
        <div className="font-body text-sm text-blue-800">
          Gérez les documents de chaque équidé : radios, ordonnances, carnet de santé, certificats, livret, factures véto.
        </div>
      </Card>

      <Card padding="md">
        <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">Ajouter un document</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <select value={equideId} onChange={e => setEquideId(e.target.value)} className={inputStyle}>
            <option value="">Équidé...</option>
            {equides.filter(e => e.status === "actif").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={type} onChange={e => setType(e.target.value)} className={inputStyle}>
            <option value="">Type...</option>
            {["Radio", "Ordonnance", "Carnet de santé", "Certificat", "Livret", "Facture véto", "Assurance", "Autre"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Libellé..." className={inputStyle}/>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputStyle}/>
        </div>
        <div className="flex gap-2">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL (Google Drive, lien externe...)" className={`flex-1 ${inputStyle}`}/>
          <button onClick={handleAdd} disabled={!equideId || !type || !label}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white font-body text-sm font-semibold border-none cursor-pointer hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400">
            Ajouter
          </button>
        </div>
      </Card>

      {documents.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="font-body text-sm text-gray-500">Aucun document enregistré.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Équidé", "Type", "Document", "Date", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 font-body text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...documents].sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")).map((d: any) => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                  <td className="px-3 py-2.5 font-body text-sm font-semibold text-blue-800">{d.equideName || "—"}</td>
                  <td className="px-3 py-2.5"><Badge color="blue">{d.type}</Badge></td>
                  <td className="px-3 py-2.5 font-body text-sm text-gray-600">
                    {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-500 underline">{d.label}</a> : d.label}
                  </td>
                  <td className="px-3 py-2.5 font-body text-xs text-gray-400">{d.date || "—"}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={async () => { if (confirm("Supprimer ce document ?")) { await deleteDoc(doc(db, "documents_equide", d.id)); onRefresh(); } }}
                      className="font-body text-xs text-red-400 bg-transparent border-none cursor-pointer hover:text-red-600">Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
