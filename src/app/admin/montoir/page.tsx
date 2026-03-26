"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, getDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { validateChildrenUpdate } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { emailTemplates } from "@/lib/email-templates";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Printer, ClipboardList,
} from "lucide-react";

interface Creneau { id: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolled: any[]; status: string; }
const typeColors: Record<string,string> = {stage:"#27ae60",balade:"#e67e22",cours:"#2050A0",competition:"#7c3aed"};

export default function MontoirPage() {
  const { toast } = useToast();
  const [dayOffset, setDayOffset] = useState(0);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [equides, setEquides] = useState<any[]>([]);
  const [indisponibilites, setIndisponibilites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartes, setCartes] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate()+dayOffset); return d; }, [dayOffset]);
  const dateStr = currentDay.toISOString().split("T")[0];

  const fetchData = async () => {
    try {
      const [cSnap, eSnap, iSnap, cartSnap, famSnap] = await Promise.all([
        getDocs(query(collection(db,"creneaux"),where("date","==",dateStr))),
        getDocs(collection(db,"equides")),
        getDocs(collection(db,"indisponibilites")),
        getDocs(collection(db,"cartes")),
        getDocs(collection(db,"families")),
      ]);
      setCreneaux(cSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>a.startTime.localeCompare(b.startTime)) as Creneau[]);
      setEquides(eSnap.docs.map(d=>({id:d.id,...d.data()})));
      setIndisponibilites(iSnap.docs.map(d=>({id:d.id,...d.data()})));
      setCartes(cartSnap.docs.map(d=>({id:d.id,...d.data()})));
      setFamilies(famSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){console.error(e);}
    setLoading(false);
  };
  useEffect(() => { setLoading(true); fetchData(); }, [dayOffset]);

  // Liste des équidés disponibles (pas sortis, pas indisponibles)
  const availableHorses = useMemo(() => {
    const activeIndispos = indisponibilites.filter((i: any) => {
      if (i.status === "terminee") return false;
      const start = i.startDate?.seconds ? new Date(i.startDate.seconds * 1000).toISOString().split("T")[0] : i.startDate || "";
      const end = i.endDate?.seconds ? new Date(i.endDate.seconds * 1000).toISOString().split("T")[0] : i.endDate || "";
      if (dateStr < start) return false;
      if (end && dateStr > end) return false;
      return true;
    }).map((i: any) => i.equideId);

    return equides
      .filter(e => e.status !== "sorti" && e.status !== "deces" && !activeIndispos.includes(e.id))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [equides, indisponibilites, dateStr]);

  const unavailableHorses = useMemo(() => {
    const activeIndispos = indisponibilites.filter((i: any) => {
      if (i.status === "terminee") return false;
      const start = i.startDate?.seconds ? new Date(i.startDate.seconds * 1000).toISOString().split("T")[0] : i.startDate || "";
      const end = i.endDate?.seconds ? new Date(i.endDate.seconds * 1000).toISOString().split("T")[0] : i.endDate || "";
      if (dateStr < start) return false;
      if (end && dateStr > end) return false;
      return true;
    });
    return activeIndispos.map((i: any) => {
      const eq = equides.find(e => e.id === i.equideId);
      return { name: eq?.name || "?", reason: i.motif || "Indisponible" };
    });
  }, [equides, indisponibilites, dateStr]);

  const updateEnrolled = async (cid: string, enrolled: any[]) => { await updateDoc(doc(db,"creneaux",cid),{enrolled}); fetchData(); };
  const togglePresence = (c: Creneau, childId: string, val: string) => { updateEnrolled(c.id, (c.enrolled||[]).map(e => e.childId===childId ? {...e, presence: val} : e)); };
  const assignHorse = (c: Creneau, childId: string, h: string) => { updateEnrolled(c.id, (c.enrolled||[]).map(e => e.childId===childId ? {...e, horseName: h} : e)); };
  const [quickNoteChild, setQuickNoteChild] = useState<{ cid: string; children: any[] } | null>(null);
  const [quickNotes, setQuickNotes] = useState<Record<string, string>>({});

  const closeCreneau = async (cid: string) => {
    const c = creneaux.find(x => x.id === cid);
    if (!c) return;
    // Anti-duplication : si déjà clôturé, ne rien faire
    if (c.status === "closed") { toast("Cette reprise est déjà clôturée.", "warning"); return; }

    const presents = (c.enrolled || []).filter((e: any) => e.presence === "present");
    const absents = (c.enrolled || []).filter((e: any) => e.presence === "absent");
    const nonPointes = (c.enrolled || []).filter((e: any) => !e.presence);

    if (nonPointes.length > 0) {
      if (!confirm(`${nonPointes.length} cavalier${nonPointes.length > 1 ? "s" : ""} non pointé${nonPointes.length > 1 ? "s" : ""}.\n\nClôturer quand même ?`)) return;
    }

    const msg = `Clôturer "${c.activityTitle}" (${c.startTime}) ?\n\n` +
      `${presents.length} présent${presents.length > 1 ? "s" : ""}, ${absents.length} absent${absents.length > 1 ? "s" : ""}`;
    if (!confirm(msg)) return;

    // 1. Clôturer le créneau
    await updateDoc(doc(db, "creneaux", cid), { status: "closed", closedAt: serverTimestamp() });

    // 2. Charger toutes les familles (depuis le state)
    const allFams = families;

    // 3. Créer une trace pédagogique pour chaque enfant présent
    let notesCreated = 0;
    for (const child of presents) {
      try {
        const famDoc = allFams.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
        if (!famDoc) continue;
        const matchChild = famDoc.children.find((ch: any) => ch.id === child.childId);
        if (!matchChild) continue;
        const peda = matchChild.peda || { objectifs: [], notes: [] };

        // Anti-doublon : vérifier si une note pour ce créneau existe déjà
        if (peda.notes.some((n: any) => n.creneauId === cid)) continue;

        const seanceNote = {
          date: new Date().toISOString(),
          text: `Séance : ${c.activityTitle} (${c.startTime}-${c.endTime})${child.horseName ? ` — Poney : ${child.horseName}` : ""}`,
          author: "Montoir (auto)",
          type: "seance",
          creneauId: cid,
          activityTitle: c.activityTitle,
          horseName: child.horseName || "",
        };
        const updatedChildren = famDoc.children.map((ch: any) =>
          ch.id === child.childId ? { ...ch, peda: { ...peda, notes: [seanceNote, ...peda.notes], updatedAt: new Date().toISOString() } } : ch
        );
        if (!validateChildrenUpdate(famDoc.id, famDoc.parentName || "", famDoc.children || [], updatedChildren, "montoir-cloture")) continue;
        await updateDoc(doc(db, "families", famDoc.id), { children: updatedChildren, updatedAt: serverTimestamp() });
        notesCreated++;
      } catch (e) { console.error("Erreur trace péda:", e); }
    }

    // 4. Débiter automatiquement les cartes des cavaliers présents
    let cartesDebitees = 0;
    for (const child of presents) {
      if ((child as any).paymentSource !== "card" || !(child as any).cardId) continue;
      const carteId = (child as any).cardId;
      try {
        const carteSnap = await getDoc(doc(db, "cartes", carteId));
        if (!carteSnap.exists()) continue;
        const carte = carteSnap.data();
        if ((carte.remainingSessions || 0) <= 0) continue;
        // Anti-doublon : vérifier si ce créneau a déjà été débité
        if ((carte.history || []).some((h: any) => h.creneauId === cid && !h.credit)) continue;
        const newHistory = [...(carte.history || []), {
          date: new Date().toISOString(),
          activityTitle: c.activityTitle,
          creneauId: cid,
          creneauDate: c.date,
          startTime: c.startTime,
          horseName: (child as any).horseName || (child as any).equideName || "",
          childName: child.childName,
          presence: "present",
          auto: true,
        }];
        const newRemaining = (carte.remainingSessions || 0) - 1;
        await updateDoc(doc(db, "cartes", carteId), {
          remainingSessions: newRemaining,
          usedSessions: (carte.usedSessions || 0) + 1,
          history: newHistory,
          status: newRemaining <= 0 ? "used" : "active",
          updatedAt: serverTimestamp(),
        });
        cartesDebitees++;
      } catch (e) { console.error("Erreur débit carte montoir:", e); }
    }

    // 4b. Tracer les absents dans l'historique de leur carte (sans débiter)
    for (const child of absents) {
      if ((child as any).paymentSource !== "card" || !(child as any).cardId) continue;
      const carteId = (child as any).cardId;
      try {
        const carteSnap = await getDoc(doc(db, "cartes", carteId));
        if (!carteSnap.exists()) continue;
        const carte = carteSnap.data();
        // Ne pas tracer si déjà tracé pour ce créneau
        if ((carte.history || []).some((h: any) => h.creneauId === cid && h.presence === "absent")) continue;
        const newHistory = [...(carte.history || []), {
          date: new Date().toISOString(),
          activityTitle: c.activityTitle,
          creneauId: cid,
          creneauDate: c.date,
          startTime: c.startTime,
          horseName: (child as any).horseName || "",
          childName: child.childName,
          presence: "absent",
          auto: true,
        }];
        await updateDoc(doc(db, "cartes", carteId), {
          history: newHistory,
          updatedAt: serverTimestamp(),
        });
        // Pas de débit — la séance reste disponible
      } catch (e) { console.error("Erreur trace absent carte:", e); }
    }

    // 5. Proposer l'ajout de notes rapides
    if (presents.length > 0) {
      setQuickNoteChild({ cid, children: presents.map(p => ({ childId: p.childId, childName: p.childName, horseName: p.horseName || "" })) });
    }

    const parts = [`Reprise clôturée.`];
    if (notesCreated > 0) parts.push(`${notesCreated} trace${notesCreated > 1 ? "s" : ""} péda.`);
    if (cartesDebitees > 0) parts.push(`${cartesDebitees} carte${cartesDebitees > 1 ? "s" : ""} débitée${cartesDebitees > 1 ? "s" : ""}.`);
    toast(parts.join(" "), "success");
    fetchData();
  };

  const saveQuickNotes = async () => {
    if (!quickNoteChild) return;
    const allFams = families;
    const authorName = "Moniteur"; // On pourrait passer le user ici

    for (const child of quickNoteChild.children) {
      const noteText = quickNotes[child.childId];
      if (!noteText?.trim()) continue;
      const famDoc = allFams.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
      if (!famDoc) continue;
      const matchChild = famDoc.children.find((ch: any) => ch.id === child.childId);
      if (!matchChild) continue;
      const peda = matchChild.peda || { objectifs: [], notes: [] };
      const note = { date: new Date().toISOString(), text: noteText.trim(), author: authorName, type: "manual" };
      const updatedChildren = famDoc.children.map((ch: any) =>
        ch.id === child.childId ? { ...ch, peda: { ...peda, notes: [note, ...peda.notes], updatedAt: new Date().toISOString() } } : ch
      );
      await updateDoc(doc(db, "families", famDoc.id), { children: updatedChildren, updatedAt: serverTimestamp() });
    }
    setQuickNoteChild(null);
    setQuickNotes({});
  };

  const totalE = creneaux.reduce((s,c)=>s+(c.enrolled?.length||0),0);
  const totalP = creneaux.reduce((s,c)=>s+(c.enrolled||[]).filter((e:any)=>e.presence==="present").length,0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div><h1 className="font-display text-2xl font-bold text-blue-800">Montoir</h1><p className="font-body text-xs text-gray-400">Présences · Affectation poneys · Clôture reprises</p></div>
        <button onClick={()=>window.print()} className="flex items-center gap-2 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><Printer size={16} /> Imprimer</button>
      </div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16} /> Veille</button>
        <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><div className="font-body text-xs text-gray-400">{creneaux.length} reprise{creneaux.length>1?"s":""} · {totalE} inscrits · {totalP} présents</div></div>
        <div className="flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain <ChevronRight size={16} /></button></div>
      </div>
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      <>
      {/* Équidés disponibles / indisponibles */}
      {equides.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="font-body text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
            {availableHorses.length} équidé{availableHorses.length > 1 ? "s" : ""} disponible{availableHorses.length > 1 ? "s" : ""}
          </div>
          {unavailableHorses.map((h, i) => (
            <div key={i} className="font-body text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg">
              {h.name} — {h.reason}
            </div>
          ))}
        </div>
      )}
      {creneaux.length === 0 ? <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><ClipboardList size={28} className="text-blue-300" /></div><p className="font-body text-sm text-gray-500">Aucune reprise ce jour.</p></Card> :
      <div className="flex flex-col gap-6">{creneaux.map(c => { const en = c.enrolled||[]; const col = typeColors[c.activityType]||"#666"; const closed = c.status==="closed"; const pres = en.filter((e:any)=>e.presence==="present").length; return (
        <Card key={c.id} padding="md" className={closed?"opacity-60":""}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-blue-500/8">
            <div className="flex items-center gap-4">
              <div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-gray-400">{c.endTime}</div></div>
              <div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-gray-400">{c.monitor} · {en.length}/{c.maxPlaces}</div></div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge color={closed?"gray":pres===en.length&&en.length>0?"green":"orange"}>{closed?"Clôturée":`${pres}/${en.length} présents`}</Badge>
              {!closed && en.length>0 && <>
                <button onClick={async () => {
                  const recipients = new Map<string, { email: string; parentName: string; children: string[] }>();
                  en.forEach((e: any) => {
                    const fam = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === e.childId));
                    if (fam?.parentEmail) {
                      const key = fam.parentEmail;
                      if (!recipients.has(key)) recipients.set(key, { email: key, parentName: fam.parentName || "", children: [] });
                      recipients.get(key)!.children.push(e.childName);
                    }
                  });
                  const isStageType = c.activityType === "stage" || c.activityType === "stage_journee";
                  let sent = 0;
                  for (const [, r] of recipients) {
                    try {
                      const emailData = isStageType
                        ? emailTemplates.rappelStage({ parentName: r.parentName, enfants: r.children, stageTitle: c.activityTitle, dateDebut: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), horaire: `${c.startTime}–${c.endTime}` })
                        : emailTemplates.rappelCours({ parentName: r.parentName, childName: r.children.join(", "), coursTitle: c.activityTitle, date: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), horaire: `${c.startTime}–${c.endTime}`, moniteur: c.monitor || "" });
                      fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: r.email, ...emailData }) }).catch(e => console.warn("Email:", e));
                      sent++;
                    } catch (e) { console.error(e); }
                  }
                  toast(`${sent} rappel${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}`, "success");
                }} className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">Rappeler</button>
                <button onClick={()=>closeCreneau(c.id)} className="font-body text-xs font-semibold text-gray-500 bg-sand px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">Clôturer</button>
              </>}
            </div>
          </div>
          {en.length===0 ? <p className="font-body text-sm text-gray-400 italic">Aucun inscrit</p> :
          <div>
            <div className="flex items-center px-3 py-2 font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              <span className="w-8 hidden sm:block">#</span><span className="flex-1">Cavalier</span><span className="w-32 hidden sm:block">Famille</span><span className="w-28 sm:w-36">Poney</span><span className="w-20 sm:w-24 text-center">Présence</span>
            </div>
            {en.map((e:any, i:number) => (
              <div key={e.childId} className={`flex items-center px-3 py-2.5 rounded-lg ${i%2===0?"bg-sand":""} ${e.presence==="absent"?"opacity-40":""}`}>
                <span className="w-8 font-body text-xs text-gray-400 hidden sm:block">{i+1}</span>
                <span className="flex-1 font-body text-sm font-semibold text-blue-800">{e.childName}</span>
                <span className="w-32 font-body text-xs text-gray-500 hidden sm:block">{e.familyName}</span>
                <span className="w-28 sm:w-36">{!closed ? (() => {
                  // Filtrer les poneys déjà affectés dans des créneaux qui se chevauchent
                  const usedInOtherCreneaux = new Set<string>();
                  creneaux.forEach(other => {
                    if (other.id === c.id) return;
                    // Vérifier chevauchement horaire
                    if (other.startTime < c.endTime && other.endTime > c.startTime) {
                      (other.enrolled || []).forEach((oe: any) => { if (oe.horseName) usedInOtherCreneaux.add(oe.horseName); });
                    }
                  });
                  // Aussi exclure les poneys déjà affectés dans CE créneau (sauf pour ce cavalier)
                  const usedInThis = new Set<string>();
                  en.forEach((oe: any) => { if (oe.childId !== e.childId && oe.horseName) usedInThis.add(oe.horseName); });

                  return <select value={e.horseName||""} onChange={ev=>assignHorse(c,e.childId,ev.target.value)} className="px-2 py-1.5 rounded-lg border border-blue-500/8 font-body text-xs bg-white w-full">
                    <option value="">Affecter...</option>
                    {availableHorses.map(h => {
                      const usedOther = usedInOtherCreneaux.has(h.name);
                      const usedHere = usedInThis.has(h.name);
                      return <option key={h.id} value={h.name} disabled={usedOther || usedHere} style={usedOther || usedHere ? {color:"#ccc"} : {}}>{h.name}{usedOther ? " (autre reprise)" : usedHere ? " (déjà affecté)" : ""}</option>;
                    })}
                  </select>;
                })() : <span className="font-body text-xs font-semibold text-blue-800">{e.horseName||"—"}</span>}</span>
                <span className="w-20 sm:w-24 flex justify-center gap-1 sm:gap-2">{!closed ? <>
                  <button onClick={()=>togglePresence(c,e.childId,"present")} className={`w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="present"?"bg-green-500 text-white":"bg-gray-100 text-gray-400 hover:bg-green-100"}`}><CheckCircle2 size={18}/></button>
                  <button onClick={()=>togglePresence(c,e.childId,"absent")} className={`w-10 h-10 sm:w-8 sm:h-8 rounded-xl sm:rounded-lg flex items-center justify-center border-none cursor-pointer ${e.presence==="absent"?"bg-red-500 text-white":"bg-gray-100 text-gray-400 hover:bg-red-100"}`}><XCircle size={18}/></button>
                </> : <Badge color={e.presence==="present"?"green":e.presence==="absent"?"red":"gray"}>{e.presence==="present"?"Présent":e.presence==="absent"?"Absent":"—"}</Badge>}</span>
              </div>
            ))}
          </div>}
        </Card>); })}</div>}
      </>}

      {/* Panel notes rapides post-clôture */}
      {quickNoteChild && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setQuickNoteChild(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Notes rapides (facultatif)</h2>
              <p className="font-body text-xs text-gray-400 mt-1">Ajoutez une observation pour chaque cavalier. Laissez vide pour passer.</p>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {quickNoteChild.children.map(child => (
                <div key={child.childId} className="bg-sand rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-body text-sm font-semibold text-blue-800">{child.childName}</span>
                    {child.horseName && <Badge color="blue">{child.horseName}</Badge>}
                  </div>
                  <input
                    value={quickNotes[child.childId] || ""}
                    onChange={e => setQuickNotes({ ...quickNotes, [child.childId]: e.target.value })}
                    placeholder="Progrès, point à travailler, remarque..."
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => { setQuickNoteChild(null); setQuickNotes({}); }}
                className="flex-1 py-2.5 rounded-lg font-body text-sm text-gray-500 bg-gray-100 border-none cursor-pointer">Passer</button>
              <button onClick={saveQuickNotes}
                className="flex-1 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
