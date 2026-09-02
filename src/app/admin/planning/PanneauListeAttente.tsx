"use client";

/**
 * src/app/admin/planning/PanneauListeAttente.tsx
 *
 * La liste d'attente d'une séance : qui attend, dans quel ordre, et les deux
 * gestes qu'on fait dessus — accepter quelqu'un dès qu'une place se libère,
 * ou retirer une demande.
 *
 * Quand la séance est complète, le même panneau sert à inscrire manuellement
 * une famille en attente : c'est le nombre de places, pas un bouton séparé,
 * qui décide de ce qui est proposé.
 *
 * Ce volet suit la sélection de famille et de cavalier faite pour
 * l'inscription — les deux gestes partagent le même choix, il n'y a pas lieu
 * de le saisir deux fois.
 */

import { useState, useEffect, useCallback } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, deleteField, doc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, Trash2, Search } from "lucide-react";
import { sameStage } from "./types";
import {
  emailLayout, emailTitre, emailButton, emailPanneau, emailLigne,
  emailParagraphe as P, emailSignature,
} from "@/lib/email-templates";

export interface PanneauListeAttenteProps {
  creneau: any;
  allCreneaux: any[];
  allFamilies: any[];
  /** Places restantes sur la séance : sous 1, on propose l'ajout manuel. */
  spots: number;
  /** Les cavaliers déjà inscrits — on n'accepte pas quelqu'un deux fois. */
  enrolled: any[];
  /** La famille et le cavalier choisis pour l'inscription. */
  selFam: string;
  setSelFam: (id: string) => void;
  selChild: string;
  setSelChild: (id: string) => void;
  search: string;
  setSearch: (s: string) => void;
  panelToast: (message: string, type?: any) => void;
  onClose: () => void;
  onRefresh?: () => void | Promise<void>;
  /**
   * Signale qu'une inscription a eu lieu : sans quoi la fermeture du panneau
   * réclamerait de confirmer l'abandon de saisies déjà enregistrées.
   */
  setInscriptionFaite: (v: boolean) => void;
  /** Les familles filtrées par la recherche, partagées avec l'inscription. */
  filteredFamilies: any[];
  /** Incrémenté par le parent pour demander une relecture de la liste. */
  rechargerToken: number;
}

export default function PanneauListeAttente({
  creneau, allCreneaux, allFamilies, spots, enrolled,
  selFam, setSelFam, selChild, setSelChild, search, setSearch,
  panelToast, onClose, onRefresh, setInscriptionFaite, filteredFamilies, rechargerToken,
}: PanneauListeAttenteProps) {
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  // ── Chargement de l'historique des notes pour ce créneau ─────────────


  // Retrait d'une entree de liste d'attente (admin). Cote famille le bouton
  // « Retirer » existe deja : l'admin n'avait que « Accepter ».
  const [waitRemoving, setWaitRemoving] = useState("");
  const retirerWaitlist = async (entry: any) => {
    if (waitRemoving) return;
    if (!confirm(`Retirer ${entry.childName} de la liste d'attente ?`)) return;
    setWaitRemoving(entry.id);
    try {
      // Si cette entree detenait une place reservee, liberer le hold : sinon
      // le creneau garderait une place bloquee pour quelqu'un qui n'est plus
      // dans la file.
      const h = (creneau as any).waitlistHold;
      if (h?.waitlistEntryId === entry.id && creneau.id) {
        await updateDoc(doc(db, "creneaux", creneau.id), { waitlistHold: deleteField() });
      }
      await deleteDoc(doc(db, "waitlist", entry.id));
      await chargerWaitlist();
      await onRefresh?.();
    } catch (e) {
      console.error("Retrait liste d'attente :", e);
      alert("Retrait impossible. Réessayez.");
    }
    setWaitRemoving("");
  };

  // Chargement de la liste d'attente, extrait en fonction RAPPELABLE.
  // En useEffect sur [creneau.id] seul, il ne se rejouait jamais apres un
  // ajout : l'identifiant du creneau ne change pas, il fallait fermer et
  // rouvrir le panneau pour voir la nouvelle entree.
  //
  // Deux requetes : les entrees « cours » portent creneauId, les entrees
  // « stage » (une seule pour toute la semaine) portent creneauIds avec TOUS
  // les jours — sinon l'attente d'un stage ne serait visible que depuis son
  // premier jour. Le statut est filtre en memoire pour ne pas exiger un
  // nouvel index composite Firestore.
  const chargerWaitlist = useCallback(async () => {
    if (!creneau.id) return;
    const [parId, parJours] = await Promise.all([
      getDocs(query(collection(db, "waitlist"), where("creneauId", "==", creneau.id), where("status", "==", "waiting"))),
      getDocs(query(collection(db, "waitlist"), where("creneauIds", "array-contains", creneau.id))),
    ]);
    const map = new Map<string, any>();
    parId.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
    parJours.docs.forEach(d => {
      const data = d.data() as any;
      if (data.status === "waiting") map.set(d.id, { id: d.id, ...data });
    });
    setWaitlist([...map.values()].sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
  }, [creneau.id]);

  useEffect(() => { chargerWaitlist(); }, [chargerWaitlist, rechargerToken]);

  const [waitAdding, setWaitAdding] = useState(false);
  const addToWaitlistAdmin = async () => {
    if (!selFam || !selChild || waitAdding) return;
    const fam = allFamilies.find((f: any) => f.firestoreId === selFam);
    const child: any = (fam?.children || []).find((c: any) => c.id === selChild);
    if (!fam || !child) return;
    const childName = child.lastName ? `${child.firstName} ${child.lastName}` : child.firstName;
    const estStage = creneau.activityType === "stage" || creneau.activityType === "stage_journee";
    const jours = estStage
      ? allCreneaux
          .filter((c: any) => sameStage(c, creneau) && (c.activityType === "stage" || c.activityType === "stage_journee"))
          .sort((a: any, b: any) => a.date.localeCompare(b.date))
      : [creneau];
    const first: any = jours[0] || creneau;
    const last: any = jours[jours.length - 1] || creneau;
    setWaitAdding(true);
    try {
      const deja = await getDocs(query(
        collection(db, "waitlist"),
        where("creneauId", "==", first.id),
        where("childId", "==", selChild),
        where("familyId", "==", fam.firestoreId),
      ));
      if (!deja.empty) {
        alert("Ce cavalier est déjà en liste d'attente pour ce créneau.");
        setWaitAdding(false); return;
      }
      await addDoc(collection(db, "waitlist"), {
        isStage: estStage && jours.length > 1,
        stageKey: `${first.activityTitle}_${first.date}`,
        creneauId: first.id,
        creneauIds: jours.map((c: any) => c.id),
        activityTitle: first.activityTitle,
        activityType: first.activityType,
        date: first.date,
        dateFin: last.date,
        nbJours: jours.length,
        startTime: first.startTime,
        endTime: first.endTime,
        monitor: first.monitor || "",
        familyId: fam.firestoreId,
        familyName: fam.parentName || "",
        familyEmail: fam.parentEmail || "",
        childId: selChild,
        childName,
        status: "waiting",
        addedByAdmin: true,
        createdAt: serverTimestamp(),
      });
      setSelFam(""); setSelChild(""); setSearch("");
      await chargerWaitlist();   // sinon l'entree n'apparait qu'apres reouverture
      onRefresh?.();
    } catch (e) {
      console.error("Ajout liste d'attente :", e);
      alert("Ajout impossible. Réessayez.");
    }
    setWaitAdding(false);
  };


  const acceptWaitlist = async (entry: any) => {
    if (spots <= 0) { alert("Toujours pas de place disponible."); return; }
    setWaitlistLoading(true);
    try {
      // Inscrire dans le créneau
      const newEnrolled = [...enrolled, {
        childId: entry.childId, childName: entry.childName,
        familyId: entry.familyId, familyName: entry.familyName,
        enrolledAt: new Date().toISOString(), presence: null,
      }];
      await updateDoc(doc(db, "creneaux", creneau.id!), {
        enrolled: newEnrolled, enrolledCount: newEnrolled.length,
        // Lever le hold 24h s'il concernait cette entrée (place réservée honorée)
        ...((creneau as any).waitlistHold?.childId === entry.childId ? { waitlistHold: deleteField() } : {}),
      });
      // Mettre à jour le statut waitlist
      await updateDoc(doc(db, "waitlist", entry.id), { status: "accepted", acceptedAt: new Date().toISOString() });
      // Notifier la famille par email
      authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: entry.familyEmail,
          subject: `Une place s'est libérée — ${creneau.activityTitle}`,
          context: "admin_place_liberee",
          template: "placeLiberee",
          familyId: entry.familyId,
          creneauId: creneau.id,
          html: emailLayout([
            emailTitre("Une place s'est libérée"),
            P(`Bonjour <strong>${entry.familyName}</strong>,`),
            P(`Bonne nouvelle : une place s'est libérée pour <strong>${entry.childName}</strong>.`),
            emailPanneau(creneau.activityTitle, [
              emailLigne("Date", new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })),
              emailLigne("Horaire", `${creneau.startTime}–${creneau.endTime}`),
            ].join("")),
            P("<strong>Cette place vous est réservée pendant 24 heures.</strong> Confirmez l'inscription depuis votre espace famille : passé ce délai, elle sera proposée aux autres familles en attente."),
            emailButton("Confirmer l'inscription", `${typeof window !== "undefined" ? window.location.origin : "https://centre-equestre-agon.vercel.app"}/espace-cavalier/reserver?creneau=${encodeURIComponent(creneau.id!)}`),
            P("Un souci pour réserver en ligne, ou une question ? Appelez-nous au <strong>02 44 84 99 96</strong> ou répondez à ce message — nous prendrons l'inscription avec vous.", 13),
            emailSignature(),
          ].join("\n"), `Place disponible — ${creneau.activityTitle}`),
        }),
      }).catch(e => console.warn("Email waitlist:", e));
      // Mettre à jour la liste locale
      setWaitlist(prev => prev.filter(w => w.id !== entry.id));
      panelToast(`✅ ${entry.childName} inscrit(e) et notifié(e) par email`, "success");
      onClose(); // Fermer le panel pour forcer un rechargement
    } catch (e) { console.error(e); }
    setWaitlistLoading(false);
  };

  return (
    <>
    {/* ── Liste d'attente ── */}
    {waitlist.length > 0 && (
      <div className="mb-4 border border-orange-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50">
          <span className="font-body text-xs font-semibold text-orange-700">🔔 Liste d'attente ({waitlist.length})</span>
          {spots > 0 && <span className="font-body text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded">Place disponible !</span>}
        </div>
        {waitlist.map((entry: any, i: number) => (
          <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 border-t border-orange-100">
            <div>
              <div className="font-body text-sm font-semibold text-blue-800">
                <span className="text-orange-400 mr-1.5">#{i + 1}</span>
                {entry.childName}
              </div>
              <div className="font-body text-xs text-slate-500">{entry.familyName}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button type="button"
                onClick={() => acceptWaitlist(entry)}
                disabled={waitlistLoading || spots <= 0}
                className={`font-body text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer ${spots > 0 ? "bg-green-500 text-white hover:bg-green-600" : "bg-gray-100 text-slate-400 cursor-not-allowed"} disabled:opacity-50`}>
                {waitlistLoading ? <Loader2 size={12} className="animate-spin inline" /> : "✓ Accepter"}
              </button>
              <button type="button"
                onClick={() => retirerWaitlist(entry)}
                disabled={waitRemoving === entry.id}
                title="Retirer de la liste d'attente"
                className="bg-transparent border-none cursor-pointer text-red-400 hover:text-red-600 px-1 disabled:opacity-40">
                {waitRemoving === entry.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    )}

    {/* ── Créneau complet : ajout MANUEL en liste d'attente ────────── */}
    {spots <= 0 && (creneau as any).status !== "closed" && (
      <div className="mb-4 border-t border-blue-500/8 pt-4">
        <h3 className="font-body text-sm font-semibold text-orange-700 mb-3">
          🔔 Ajouter en liste d&apos;attente
        </h3>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setSelFam(""); setSelChild(""); setInscriptionFaite(false); }}
              placeholder="Nom parent, prénom enfant, email..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-orange-400 focus:outline-none" />
          </div>
          <select value={selFam} onChange={e => { setSelFam(e.target.value); setSelChild(""); setInscriptionFaite(false); }}
            className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream">
            <option value="">Famille ({filteredFamilies.length})</option>
            {filteredFamilies.map(f => {
              const n = (f.children || []).map((c: any) => c.firstName).join(", ");
              return <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n ? `(${n})` : ""}</option>;
            })}
          </select>
          {selFam && (
            <select value={selChild} onChange={e => setSelChild(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream">
              <option value="">Cavalier…</option>
              {(allFamilies.find((f: any) => f.firestoreId === selFam)?.children || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName || ""}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={addToWaitlistAdmin} disabled={!selChild || waitAdding}
            className={`w-full py-2.5 rounded-lg font-body text-sm font-semibold border-none ${!selChild || waitAdding ? "bg-gray-100 text-slate-400 cursor-not-allowed" : "bg-orange-500 text-white cursor-pointer hover:bg-orange-600"}`}>
            {waitAdding ? <Loader2 size={14} className="animate-spin inline" /> : "🔔 Mettre en liste d'attente"}
          </button>
          <p className="font-body text-[11px] text-slate-500">
            La famille sera prévenue par email si une place se libère
            {(creneau.activityType === "stage" || creneau.activityType === "stage_journee") ? " sur la semaine complète" : ""}.
          </p>
        </div>
      </div>
    )}
    </>
  );
}
