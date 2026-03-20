"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Send, Mail, ChevronDown } from "lucide-react";

export default function EmailReprisePage() {
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCreneau, setSelectedCreneau] = useState<any>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmails, setSentEmails] = useState<any[]>([]);

  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d; }, [dayOffset]);
  const dateStr = currentDay.toISOString().split("T")[0];

  const fetchData = async () => {
    try {
      const [crSnap, famSnap, sentSnap] = await Promise.all([
        getDocs(query(collection(db, "creneaux"), where("date", "==", dateStr))),
        getDocs(collection(db, "families")),
        getDocs(collection(db, "emailsReprise")),
      ]);
      setCreneaux(crSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.startTime?.localeCompare(b.startTime)) as any[]);
      setFamilies(famSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSentEmails(sentSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { setLoading(true); fetchData(); }, [dayOffset]);

  const getEmails = (creneau: any) => {
    if (!creneau?.enrolled) return [];
    const familyIds = [...new Set(creneau.enrolled.map((e: any) => e.familyId))];
    return familyIds.map(fid => {
      const fam = families.find(f => f.id === fid);
      return fam ? { name: fam.parentName, email: fam.parentEmail } : null;
    }).filter(Boolean);
  };

  const selectCreneau = (c: any) => {
    setSelectedCreneau(c);
    setSent(false);
    setSubject(`${c.activityTitle} — ${currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`);
    setMessage(`Bonjour,\n\nCe message concerne la reprise "${c.activityTitle}" du ${currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} de ${c.startTime} à ${c.endTime}.\n\n[Votre message ici]\n\nCordialement,\nLe Centre Équestre d'Agon-Coutainville`);
  };

  const handleSend = async () => {
    if (!selectedCreneau || !subject || !message) return;
    setSending(true);
    const recipients = getEmails(selectedCreneau);

    // Log in Firestore (quand Resend sera branché, on enverra pour de vrai)
    await addDoc(collection(db, "emailsReprise"), {
      creneauId: selectedCreneau.id,
      creneauTitle: selectedCreneau.activityTitle,
      date: dateStr,
      subject,
      message,
      recipients: recipients.map((r: any) => r.email),
      recipientCount: recipients.length,
      status: "logged", // deviendra "sent" quand Resend sera branché
      createdAt: serverTimestamp(),
    });

    setSent(true);
    setSending(false);
    fetchData();
  };

  const typeColors: Record<string, string> = { stage: "#27ae60", balade: "#e67e22", cours: "#2050A0", competition: "#7c3aed" };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Email collectif</h1>
          <p className="font-body text-xs text-gray-400">Envoyer un message aux familles d&apos;une reprise</p>
        </div>
      </div>

      {/* Day nav */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setDayOffset(d => d - 1)} className="font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">← Veille</button>
        <div className="font-display text-base font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        <div className="flex gap-2">
          <button onClick={() => setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button>
          <button onClick={() => setDayOffset(d => d + 1)} className="font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain →</button>
        </div>
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : (
        <div className="flex gap-6 flex-wrap">
          {/* Left: creneaux list */}
          <div className="flex-1 min-w-[280px]">
            <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Reprises du jour ({creneaux.length})</div>
            {creneaux.length === 0 ? (
              <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-500">Aucune reprise ce jour.</p></Card>
            ) : (
              <div className="flex flex-col gap-2">
                {creneaux.map(c => {
                  const en = c.enrolled?.length || 0;
                  const emails = getEmails(c);
                  const isSelected = selectedCreneau?.id === c.id;
                  return (
                    <Card key={c.id} padding="sm" className={`cursor-pointer transition-all ${isSelected ? "!border-blue-500 !bg-blue-50/50" : "hover:shadow-sm"}`}
                      onClick={() => selectCreneau(c)}>
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-10 rounded-full" style={{ background: typeColors[c.activityType] || "#666" }} />
                        <div className="flex-1">
                          <div className="font-body text-sm font-semibold text-blue-800">{c.activityTitle}</div>
                          <div className="font-body text-xs text-gray-400">{c.startTime}–{c.endTime} · {c.monitor} · {en} inscrits</div>
                        </div>
                        <div className="text-right">
                          <Badge color={en > 0 ? "blue" : "gray"}>{emails.length} emails</Badge>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Sent history */}
            {sentEmails.length > 0 && (
              <div className="mt-6">
                <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Derniers envois</div>
                <div className="flex flex-col gap-2">
                  {sentEmails.slice(0, 5).map(e => (
                    <div key={e.id} className="flex items-center gap-3 font-body text-xs text-gray-500 bg-sand rounded-lg px-3 py-2">
                      <Mail size={12} className="text-gray-400" />
                      <span className="flex-1">{e.creneauTitle} — {e.date}</span>
                      <Badge color="green">{e.recipientCount} dest.</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: compose */}
          <div className="flex-1 min-w-[380px]">
            {selectedCreneau ? (
              <Card padding="md">
                {sent ? (
                  <div className="text-center py-8">
                    <span className="text-5xl block mb-4">✅</span>
                    <div className="font-body text-lg font-semibold text-blue-800 mb-2">Email enregistré !</div>
                    <p className="font-body text-sm text-gray-500 mb-4">
                      {getEmails(selectedCreneau).length} destinataires. L&apos;envoi réel sera activé quand Resend sera branché.
                    </p>
                    <button onClick={() => { setSent(false); setSelectedCreneau(null); }}
                      className="font-body text-sm text-blue-500 bg-transparent border-none cursor-pointer">← Choisir une autre reprise</button>
                  </div>
                ) : (
                  <>
                    <div className="font-body text-sm font-semibold text-blue-800 mb-3">
                      📧 Email à la reprise : {selectedCreneau.activityTitle}
                    </div>

                    {/* Recipients */}
                    <div className="mb-4">
                      <div className="font-body text-xs font-semibold text-gray-400 mb-1">Destinataires ({getEmails(selectedCreneau).length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {getEmails(selectedCreneau).map((r: any, i: number) => (
                          <span key={i} className="font-body text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                            {r.name} ({r.email})
                          </span>
                        ))}
                        {getEmails(selectedCreneau).length === 0 && (
                          <span className="font-body text-xs text-gray-400 italic">Aucun inscrit avec email</span>
                        )}
                      </div>
                    </div>

                    {/* Subject */}
                    <div className="mb-3">
                      <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Objet</label>
                      <input value={subject} onChange={e => setSubject(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
                    </div>

                    {/* Message */}
                    <div className="mb-4">
                      <label className="font-body text-xs font-semibold text-gray-500 block mb-1">Message</label>
                      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={8}
                        className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none resize-vertical" />
                    </div>

                    {/* Send */}
                    <button onClick={handleSend} disabled={getEmails(selectedCreneau).length === 0 || sending}
                      className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-3 rounded-xl border-none cursor-pointer disabled:opacity-40 hover:bg-blue-400">
                      <Send size={16} /> {sending ? "Envoi..." : `Envoyer à ${getEmails(selectedCreneau).length} famille(s)`}
                    </button>
                  </>
                )}
              </Card>
            ) : (
              <Card padding="lg" className="text-center">
                <Mail size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="font-body text-sm text-gray-500">Sélectionnez une reprise à gauche pour rédiger un email collectif.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
