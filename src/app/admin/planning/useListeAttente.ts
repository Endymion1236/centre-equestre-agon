"use client";
/**
 * src/app/admin/planning/useListeAttente.ts
 *
 * Liste d'attente d'un créneau, vue admin : chargement, acceptation, retrait,
 * ajout manuel, et libération d'une place « tenue ».
 *
 * Regroupé hors du panneau parce que c'est un sous-système à part entière,
 * avec ses propres pièges, tous documentés en place ci-dessous :
 *  - la file se recharge par une fonction RAPPELABLE (et non un effet sur
 *    [creneau.id]) : l'identifiant ne change pas après un ajout, il fallait
 *    fermer et rouvrir le panneau pour voir la nouvelle entrée ;
 *  - deux requêtes, parce qu'une attente de stage porte TOUS les jours dans
 *    creneauIds alors qu'un cours porte un creneauId unique ;
 *  - retirer quelqu'un qui détenait une place réservée libère aussi le hold,
 *    sinon le créneau garde une place bloquée pour quelqu'un qui n'est plus
 *    dans la file.
 *
 * Le hook reçoit ce dont il a besoin du panneau (inscrits, places restantes,
 * sélection courante) et lui rend des actions prêtes à brancher sur les
 * boutons.
 */

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, deleteField, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { sameStage } from "./types";
import { holdActifDe } from "./enroll-helpers";

export function useListeAttente({
  creneau, enrolled, spots, allFamilies, allCreneaux, selFam, selChild,
  panelToast, onClose, onRefresh, onAjoutReussi,
}: {
  creneau: any;
  enrolled: any[];
  spots: number;
  allFamilies: any[];
  allCreneaux: any[];
  selFam: string;
  selChild: string;
  panelToast: (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
  /** Vider la recherche et la sélection après un ajout en attente. */
  onAjoutReussi: () => void;
}) {
  // Liste d'attente
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

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

  useEffect(() => { chargerWaitlist(); }, [chargerWaitlist]);

  // ── Place tenue pour une famille en liste d'attente ──────────────────
  // Le hold pose par la notification "une place s'est liberee" reste sur le
  // creneau tant que la famille n'a pas reserve. Si l'admin remplit la place
  // entre-temps, le hold devient une trace fantome : l'espace famille ne
  // l'affiche plus (la dispo reelle est verifiee), mais l'entree de liste
  // d'attente reste bloquee en "notifiee" et ne sera jamais renotifiee.
  // On expose donc une liberation EXPLICITE plutot qu'un nettoyage silencieux.
  const [holdReleasing, setHoldReleasing] = useState(false);
  const holdActif = holdActifDe(creneau, enrolled);
  const libererHold = async () => {
    const h = holdActif;
    if (!h || holdReleasing) return;
    if (!confirm(`Libérer la place réservée à ${h.childName} ? Sa demande repassera en liste d'attente.`)) return;
    setHoldReleasing(true);
    try {
      await updateDoc(doc(db, "creneaux", creneau.id!), { waitlistHold: deleteField() });
      if (h.waitlistEntryId) {
        // La famille garde sa place dans la file : on ne supprime pas
        // l'entrée, on la remet simplement en attente.
        await updateDoc(doc(db, "waitlist", h.waitlistEntryId), {
          status: "waiting",
          holdUntil: deleteField(),
          releasedByAdminAt: new Date().toISOString(),
        }).catch(() => {});
      }
      await chargerWaitlist();   // l'entree repasse en « waiting » : la reafficher
      await onRefresh?.();
    } catch (e) {
      console.error("Libération hold :", e);
      alert("Libération impossible. Réessayez.");
    }
    setHoldReleasing(false);
  };

  // ── Ajout MANUEL en liste d'attente (admin) ──────────────────────────
  // Une famille appelle, le créneau est complet : on l'inscrit en attente
  // sans qu'elle ait à passer par l'espace famille. Même structure de
  // document que l'inscription côté client, pour que l'acceptation et la
  // notification fonctionnent à l'identique.
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
      onAjoutReussi();
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
          subject: `🎉 Une place s'est libérée — ${creneau.activityTitle}`,
          context: "admin_place_liberee",
          template: "placeLiberee",
          familyId: entry.familyId,
          creneauId: creneau.id,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <p>Bonjour <strong>${entry.familyName}</strong>,</p>
            <p>Bonne nouvelle ! Une place s'est libérée pour <strong>${entry.childName}</strong> :</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;color:#166534;font-weight:600;">✅ ${creneau.activityTitle}</p>
              <p style="margin:8px 0 0;color:#555;font-size:13px;">📅 ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })}</p>
              <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 ${creneau.startTime}–${creneau.endTime}</p>
            </div>
            <p><strong>Cette place vous est réservée pendant 24 heures.</strong> Confirmez l'inscription depuis votre espace famille : elle sera ensuite proposée aux autres familles en attente.</p>
            <p style="text-align:center;margin:24px 0;">
              <a href="${typeof window !== "undefined" ? window.location.origin : "https://centre-equestre-agon.vercel.app"}/espace-cavalier/reserver?creneau=${encodeURIComponent(creneau.id!)}"
                 style="background:#16a34a;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">
                Confirmer l'inscription
              </a>
            </p>
            <p style="color:#555;font-size:13px;line-height:1.6;">Un souci pour réserver en ligne, ou une question ? Appelez-nous au <strong>02 44 84 99 96</strong> ou répondez à ce message — nous prendrons l'inscription avec vous.</p>
            <p>À bientôt au centre équestre !</p>
          </div>`,
        }),
      }).catch(e => console.warn("Email waitlist:", e));
      // Mettre à jour la liste locale
      setWaitlist(prev => prev.filter(w => w.id !== entry.id));
      panelToast(`✅ ${entry.childName} inscrit(e) et notifié(e) par email`, "success");
      onClose(); // Fermer le panel pour forcer un rechargement
    } catch (e) { console.error(e); }
    setWaitlistLoading(false);
  };


  return {
    waitlist, waitlistLoading, waitRemoving, waitAdding, holdReleasing, holdActif,
    chargerWaitlist, retirerWaitlist, libererHold, addToWaitlistAdmin, acceptWaitlist,
  };
}
