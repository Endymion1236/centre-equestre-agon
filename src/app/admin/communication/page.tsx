"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { Send, Mail, Users, Star, Zap, Loader2, Plus, Clock, Check, History } from "lucide-react";
import type { Family } from "@/types";

export default function CommunicationPage() {
  const [tab, setTab] = useState<"newsletter" | "historique">("newsletter");
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAudience, setSelectedAudience] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<{ ok: number; fail: number } | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "families")),
      getDocs(collection(db, "communications")),
    ]).then(([famSnap, histSnap]) => {
      setFamilies(famSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setHistory(histSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0)));
      setLoading(false);
    });
  }, []);

  const audiences = [
    { id: "all", label: "Toutes les familles", count: families.length },
    { id: "with-children", label: "Familles avec enfants", count: families.filter((f) => (f.children || []).length > 0).length },
    { id: "no-children", label: "Profils incomplets", count: families.filter((f) => (f.children || []).length === 0).length },
    { id: "with-email", label: "Familles avec email", count: families.filter((f) => f.parentEmail).length },
  ];

  const getRecipients = () => {
    if (selectedAudience === "all") return families.filter(f => f.parentEmail);
    if (selectedAudience === "with-children") return families.filter(f => f.parentEmail && (f.children || []).length > 0);
    if (selectedAudience === "no-children") return families.filter(f => f.parentEmail && (f.children || []).length === 0);
    if (selectedAudience === "with-email") return families.filter(f => f.parentEmail);
    return [];
  };

  const replaceVariables = (text: string, family: any) => {
    return text
      .replace(/\[prenom_parent\]/g, family.parentName?.split(" ")[0] || "")
      .replace(/\[nom_famille\]/g, family.parentName || "")
      .replace(/\[prenom_enfant\]/g, (family.children || [])[0]?.firstName || "")
      .replace(/\[nb_enfants\]/g, (family.children || []).length.toString())
      .replace(/\[lien_reservation\]/g, "https://centre-equestre-agon.vercel.app/espace-cavalier/reserver");
  };

  const handleSend = async () => {
    const recipients = getRecipients();
    if (recipients.length === 0 || !subject) return;
    setSending(true);
    let ok = 0, fail = 0;

    for (const fam of recipients) {
      try {
        const personalSubject = replaceVariables(subject, fam);
        const personalBody = replaceVariables(body, fam);
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: fam.parentEmail,
            subject: personalSubject,
            html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;">
              <h2 style="color:#1e3a5f;">Centre Equestre d'Agon-Coutainville</h2>
              ${personalBody.split("\n").map(l => `<p style="color:#333;line-height:1.6;">${l}</p>`).join("")}
              <hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />
              <p style="color:#999;font-size:11px;">Centre Equestre d'Agon-Coutainville — 02 44 84 99 96</p>
            </div>`,
          }),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }

    // Sauvegarder dans Firestore
    await addDoc(collection(db, "communications"), {
      subject,
      body,
      audience: selectedAudience,
      recipientCount: recipients.length,
      sentOk: ok,
      sentFail: fail,
      sentAt: serverTimestamp(),
    });

    setSentResult({ ok, fail });
    setSending(false);
    // Refresh historique
    const histSnap = await getDocs(collection(db, "communications"));
    setHistory(histSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.sentAt?.seconds || 0) - (a.sentAt?.seconds || 0)));
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Communication</h1>

      <div className="flex gap-2 mb-6">
        {([["newsletter", "Envoyer un email", Mail], ["historique", "Historique", History]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "newsletter" && (
        <div>
          {sentResult ? (
            <Card padding="lg" className="text-center">
              <span className="text-5xl block mb-4">{sentResult.fail === 0 ? "✅" : "⚠️"}</span>
              <h2 className="font-display text-xl font-bold text-blue-800 mb-2">{sentResult.ok} email{sentResult.ok > 1 ? "s" : ""} envoyé{sentResult.ok > 1 ? "s" : ""}</h2>
              {sentResult.fail > 0 && <p className="font-body text-sm text-red-500 mb-2">{sentResult.fail} échec{sentResult.fail > 1 ? "s" : ""}</p>}
              <button onClick={() => { setSentResult(null); setSubject(""); setBody(""); setSelectedAudience(""); }}
                className="font-body text-sm font-semibold text-blue-500 bg-transparent border-none cursor-pointer underline">
                Créer un autre email
              </button>
            </Card>
          ) : (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Créer un email</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Destinataires</label>
                  <div className="flex flex-col gap-2">
                    {audiences.map((a) => (
                      <label key={a.id} onClick={() => setSelectedAudience(a.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-all
                          ${selectedAudience === a.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedAudience === a.id ? "border-blue-500" : "border-gray-300"}`}>
                            {selectedAudience === a.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                          </div>
                          <span className="font-body text-sm font-medium text-blue-800">{a.label}</span>
                        </div>
                        <Badge color="blue">{a.count}</Badge>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Objet</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: Les stages de Pâques arrivent !" className={inputCls} />
                </div>

                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Message</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Bonjour [prenom_parent],&#10;&#10;Écrivez votre message ici..." className={`${inputCls} resize-y`} />
                </div>

                <div>
                  <div className="font-body text-xs font-semibold text-gray-400 mb-2">Variables (cliquez pour insérer) :</div>
                  <div className="flex flex-wrap gap-2">
                    {["[prenom_parent]", "[nom_famille]", "[prenom_enfant]", "[nb_enfants]", "[lien_reservation]"].map((v) => (
                      <button key={v} onClick={() => setBody((b) => b + v)}
                        className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg cursor-pointer border-none hover:bg-blue-100">{v}</button>
                    ))}
                  </div>
                </div>

                <button onClick={handleSend} disabled={!selectedAudience || !subject || sending}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-body text-sm font-semibold border-none cursor-pointer
                    ${!selectedAudience || !subject || sending ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {sending ? `Envoi en cours (${getRecipients().length} destinataires)...` : `Envoyer à ${getRecipients().length} famille${getRecipients().length > 1 ? "s" : ""}`}
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "historique" && (
        <div>
          {history.length === 0 ? (
            <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-500">Aucun email envoyé.</p></Card>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((h: any) => {
                const d = h.sentAt?.seconds ? new Date(h.sentAt.seconds * 1000) : new Date();
                return (
                  <Card key={h.id} padding="md">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{h.subject}</div>
                        <div className="font-body text-xs text-gray-400">{d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color="green">{h.sentOk} envoyé{h.sentOk > 1 ? "s" : ""}</Badge>
                        {h.sentFail > 0 && <Badge color="red">{h.sentFail} échec{h.sentFail > 1 ? "s" : ""}</Badge>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
