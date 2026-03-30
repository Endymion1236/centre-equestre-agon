"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { emailTemplates } from "@/lib/email-templates";
import { generateOrderId } from "@/lib/utils";

const calcAge = (birthDate: any): string => {
  if (!birthDate) return "";
  const bd = new Date(
    typeof birthDate === "string" ? birthDate :
    birthDate?.seconds ? birthDate.seconds * 1000 : birthDate
  );
  if (isNaN(bd.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
  return `${age} ans`;
};
import {
  findStageCreneaux, countExistingStageInscriptions, computeStageReductions,
  enrollChildInCreneau, createReservation, removeChildFromCreneau, deleteReservations,
} from "@/lib/planning-services";
import { X, Check, Loader2, Trash2, Users, UserPlus, Search, CreditCard, Camera, FileImage, Mail, Sparkles, Send } from "lucide-react";
import type { Activity, Family } from "@/types";
import { Creneau, EnrolledChild, payModes, typeColors, fmtDate } from "./types";

function EnrollPanel({ creneau, families, allCreneaux, payments, allCartes, allForfaits, onClose, onEnroll, onUnenroll }: {
  creneau: Creneau & { id: string }; families: (Family & { firestoreId: string })[]; allCreneaux: (Creneau & { id: string })[]; payments: any[]; allCartes: any[]; allForfaits: any[];  onClose: () => void;
  onEnroll: (id: string, c: EnrolledChild, payMode?: string, options?: { skipPayment?: boolean; skipEmail?: boolean }) => Promise<void>;
  onUnenroll: (id: string, childId: string) => Promise<void>;
}) {
  const { toast: panelToast } = useToast();
  const [search, setSearch] = useState(""); const [selFam, setSelFam] = useState(""); const [selChild, setSelChild] = useState("");
  const [enrolling, setEnrolling] = useState(false); const [justEnrolled, setJustEnrolled] = useState("");
  const [showPay, setShowPay] = useState(false); const [payMode, setPayMode] = useState("cb_terminal"); const [unenrolling, setUnenrolling] = useState("");
  const [inscriptionMode, setInscriptionMode] = useState<"ponctuel" | "annuel">("ponctuel");
  const [licenceType, setLicenceType] = useState<"moins18" | "plus18">("moins18");
  const [adhesion, setAdhesion] = useState(true);
  const [licence, setLicence] = useState(true);
  const [assuranceOccasionnelle, setAssuranceOccasionnelle] = useState(false);
  const [payPlan, setPayPlan] = useState<"1x" | "3x" | "10x">("1x");

  // ── Création famille inline ──
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [newFam, setNewFam] = useState({ parentName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "" });
  const [newChild, setNewChild] = useState({ firstName: "", birthDate: "", galopLevel: "—" });
  const [creatingFamily, setCreatingFamily] = useState(false);

  // Plan de séance
  const [planUploading, setPlanUploading] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxBlobUrl, setLightboxBlobUrl] = useState<string | null>(null);

  const openLightbox = async () => {
    setLightbox(true);
    if (!planUrl) return;
    try {
      const resp = await fetch(planUrl, { mode: "cors" });
      if (!resp.ok) throw new Error("fetch failed");
      const blob = await resp.blob();
      // Convertir HEIC en affichable si besoin
      setLightboxBlobUrl(URL.createObjectURL(blob));
    } catch {
      // CORS bloqué → fallback sur URL directe dans un nouvel onglet
      setLightboxBlobUrl("cors_error:" + planUrl);
    }
  };

  const closeLightbox = () => {
    setLightbox(false);
    if (lightboxBlobUrl && lightboxBlobUrl.startsWith("blob:")) {
      URL.revokeObjectURL(lightboxBlobUrl);
    }
    setLightboxBlobUrl(null);
  };
  const [planUrl, setPlanUrl] = useState<string | null>((creneau as any).planSeanceUrl || null);
  const [planType, setPlanType] = useState<string | null>((creneau as any).planSeanceType || null);
  const planInputRef = useRef<HTMLInputElement>(null);
  // Liste d'attente
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  useEffect(() => {
    if (!creneau.id) return;
    getDocs(query(collection(db, "waitlist"), where("creneauId", "==", creneau.id), where("status", "==", "waiting")))
      .then(snap => setWaitlist(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))));
  }, [creneau.id]);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [stageMode, setStageMode] = useState<"semaine" | "jour">("semaine");
  const [stageDaysCount, setStageDaysCount] = useState<number>(0);
  const [showAddDays, setShowAddDays] = useState<{ familyId: string; enfants: { childId: string; childName: string }[]; joursRestants: { id: string; date: string; label: string }[]; totalJoursStage: number; joursInscrits: number; stageTitle: string; creneauRef: any } | null>(null);
  const isStage = creneau.activityType === "stage" || creneau.activityType === "stage_journee";

  // ── Email créneau ──
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailGenerating, setEmailGenerating] = useState(false);

  // Charger le nombre réel de jours du stage depuis Firestore (pas allCreneaux qui est limité à la vue)
  useEffect(() => {
    if (!isStage) return;
    const creneauDate = new Date(creneau.date);
    const dow = creneauDate.getDay();
    const mon = new Date(creneauDate); mon.setDate(mon.getDate() - ((dow + 6) % 7));
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const monStr = mon.toISOString().split("T")[0];
    const sunStr = sun.toISOString().split("T")[0];

    getDocs(query(collection(db, "creneaux"), where("date", ">=", monStr), where("date", "<=", sunStr)))
      .then(snap => {
        const days = snap.docs.filter(d => {
          const data = d.data();
          return data.activityTitle === creneau.activityTitle &&
            (data.activityType === "stage" || data.activityType === "stage_journee");
        }).length;
        setStageDaysCount(days || 1);
        console.log(`📋 Stage "${creneau.activityTitle}" : ${days} jour(s) cette semaine`);
      })
      .catch(() => setStageDaysCount(1));
  }, [isStage, creneau.date, creneau.activityTitle]);

  const enrolled = creneau.enrolled || []; const enrolledIds = enrolled.map((e: any) => e.childId);
  const spots = creneau.maxPlaces - enrolled.length; const color = typeColors[creneau.activityType] || "#666";
  const priceTTC = (creneau as any).priceTTC || (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);
  // Prix affiché dans l'en-tête : pour les stages, utiliser le tarif configuré si dispo
  const displayPrice = useMemo(() => {
    if (!isStage) return priceTTC;
    const nbJours = stageDaysCount || 1;
    const cr = creneau as any;
    const prices: Record<number, number> = {};
    if (cr.price1day) prices[1] = cr.price1day;
    if (cr.price2days) prices[2] = cr.price2days;
    if (cr.price3days) prices[3] = cr.price3days;
    if (cr.price4days) prices[4] = cr.price4days;
    return prices[nbJours] || priceTTC;
  }, [isStage, priceTTC, creneau, stageDaysCount]);
  const filteredFamilies = useMemo(() => { if (!search) return families; const terms = search.toLowerCase().trim().split(/\s+/); return families.filter(f => { const childText = (f.children || []).map((c: any) => `${c.firstName || ""} ${c.lastName || ""}`).join(" "); const searchable = `${f.parentName || ""} ${f.parentEmail || ""} ${childText}`.toLowerCase(); return terms.every(t => searchable.includes(t)); }); }, [families, search]);

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
      });
      // Mettre à jour le statut waitlist
      await updateDoc(doc(db, "waitlist", entry.id), { status: "accepted", acceptedAt: new Date().toISOString() });
      // Notifier la famille par email
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: entry.familyEmail,
          subject: `🎉 Une place s'est libérée — ${creneau.activityTitle}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <p>Bonjour <strong>${entry.familyName}</strong>,</p>
            <p>Bonne nouvelle ! Une place s'est libérée pour <strong>${entry.childName}</strong> :</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;color:#166534;font-weight:600;">✅ ${creneau.activityTitle}</p>
              <p style="margin:8px 0 0;color:#555;font-size:13px;">📅 ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })}</p>
              <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 ${creneau.startTime}–${creneau.endTime}</p>
            </div>
            <p><strong>${entry.childName} est maintenant inscrit(e).</strong> Vous recevrez prochainement les informations de paiement.</p>
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

  const uploadPlan = async (file: File) => {
    if (!creneau.id) return;
    setPlanUploading(true);
    try {
      // Accepter tous les formats image (HEIC iPhone inclus)
      const allowed = ["image/jpeg","image/png","image/webp","image/heic","image/heif","image/gif","application/pdf"];
      const isImage = file.type.startsWith("image/") || file.type === "";
      if (!isImage && !allowed.includes(file.type)) throw new Error("Format non supporté (JPG, PNG, HEIC, PDF)");
      if (file.size > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 10 Mo)");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `plans-seance/${creneau.id}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);

      // Upload direct depuis le navigateur
      const snapshot = await uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });
      const url = await getDownloadURL(snapshot.ref);

      // Supprimer l'ancien fichier si existant
      if ((creneau as any).planSeancePath) {
        try { await deleteObject(ref(storage, (creneau as any).planSeancePath)); } catch {}
      }

      await updateDoc(doc(db, "creneaux", creneau.id), {
        planSeanceUrl: url,
        planSeancePath: path,
        planSeanceType: file.type,
        planSeanceUpdatedAt: new Date().toISOString(),
      });
      setPlanUrl(url);
      setPlanType(file.type);
    } catch (e: any) {
      alert(`Erreur upload : ${e.message}`);
    }
    setPlanUploading(false);
  };

  const deletePlan = async () => {
    if (!creneau.id || !confirm("Supprimer le plan de séance ?")) return;
    // Supprimer le fichier du Storage
    if ((creneau as any).planSeancePath) {
      try { await deleteObject(ref(storage, (creneau as any).planSeancePath)); } catch {}
    }
    await updateDoc(doc(db, "creneaux", creneau.id), {
      planSeanceUrl: null,
      planSeancePath: null,
      planSeanceType: null,
    });
    setPlanUrl(null);
    setPlanType(null);
  };
  const fam = families.find(f => f.firestoreId === selFam); const children = fam?.children || [];
  const available = children.filter((c: any) => {
    if (enrolledIds.includes(c.id)) return false;
    // Vérifier si l'enfant est déjà inscrit sur un autre créneau qui chevauche cet horaire
    const conflict = allCreneaux.find(other => {
      if (other.id === creneau.id) return false;
      if (other.date !== creneau.date) return false;
      if (!(other.enrolled || []).some((e: any) => e.childId === c.id)) return false;
      // Vérifier le chevauchement horaire : deux créneaux se chevauchent si
      // l'un commence avant que l'autre ne finisse et vice versa
      const s1 = creneau.startTime, e1 = creneau.endTime;
      const s2 = other.startTime, e2 = other.endTime;
      return s1 < e2 && s2 < e1;
    });
    return !conflict;
  });

  // ─── Paramètres inscription depuis Firestore ──────────────────────────────
  const [inscParams, setInscParams] = useState({
    forfait1x: 650, forfait2x: 1100, forfait3x: 1400,
    adhesion1: 60, adhesion2: 40, adhesion3: 20, adhesion4plus: 0,
    licenceMoins18: 25, licencePlus18: 36,
    totalSessionsSaison: 35, dateFinSaison: "2026-06-30",
    assuranceOccasionnelle: 10,
  });

  useEffect(() => {
    getDocs(collection(db, "settings")).then(snap => {
      const inscDoc = snap.docs.find(d => d.id === "inscription");
      if (inscDoc) setInscParams(prev => ({ ...prev, ...inscDoc.data() }));
    }).catch(() => {});
  }, []);

  // Calcul forfait annuel avec prorata
  const prixLicence = licenceType === "moins18" ? inscParams.licenceMoins18 : inscParams.licencePlus18;
  // Forfait selon fréquence (sélectionnable)
  const [frequenceCours, setFrequenceCours] = useState<1 | 2 | 3>(1);
  const [extraSlots, setExtraSlots] = useState<string[]>([]); // 2ème + 3ème créneaux pour 2×/3×/sem
  const [extraSlotSearch, setExtraSlotSearch] = useState("");
  const prixForfaitAnnuel = frequenceCours === 3 ? inscParams.forfait3x : frequenceCours === 2 ? inscParams.forfait2x : inscParams.forfait1x;
  const totalSessionsSaison = inscParams.totalSessionsSaison * frequenceCours;
  const dateFinSaison = inscParams.dateFinSaison;

  // Calculer les séances restantes entre aujourd'hui et le 30 juin
  // pour le jour de la semaine du créneau
  const sessionsRestantes = useMemo(() => {
    const today = new Date();
    const fin = new Date(dateFinSaison);
    const creneauDate = new Date(creneau.date);
    const jourSemaine = creneauDate.getDay(); // 0=dim, 1=lun, ... 6=sam
    let count = 0;
    const cursor = new Date(today);
    // Aller au prochain jour correspondant
    while (cursor.getDay() !== jourSemaine) cursor.setDate(cursor.getDate() + 1);
    // Compter les occurrences jusqu'à fin de saison
    while (cursor <= fin) {
      count++;
      cursor.setDate(cursor.getDate() + 7);
    }
    return count;
  }, [creneau.date]);

  const prorata = sessionsRestantes / (inscParams.totalSessionsSaison || 35);
  const prixForfait = Math.round(prixForfaitAnnuel * prorata);

  // Adhésion dégressive : compter enfants déjà inscrits en forfait annuel cette saison
  const rangEnfantFamille = useMemo(() => {
    if (!fam) return 1;
    const enfantsInscrits = new Set<string>();
    // Chercher dans les forfaits actifs de cette famille
    allForfaits.filter((f: any) => f.familyId === fam.firestoreId).forEach((f: any) => {
      if (f.childId && f.childId !== selChild) enfantsInscrits.add(f.childId);
    });
    return enfantsInscrits.size + 1; // rang = nb déjà inscrits + 1
  }, [fam, allForfaits, selChild]);

  const prixAdhesionDegressif =
    rangEnfantFamille === 1 ? inscParams.adhesion1 :
    rangEnfantFamille === 2 ? inscParams.adhesion2 :
    rangEnfantFamille === 3 ? inscParams.adhesion3 :
    inscParams.adhesion4plus;

  const totalAnnuel = (adhesion ? prixAdhesionDegressif : 0) + (licence ? prixLicence : 0) + prixForfait;

  // Calcul stage : réductions fratrie uniquement sur les enfants inscrits EN MÊME TEMPS
  // Pas de cumul avec les inscriptions passées — une fois encaissé, compteur reset
  const existingStageCount = 0;

  const stageLines = useMemo(() => {
    if (!isStage) return [];

    // Nombre de jours réel du stage (chargé depuis Firestore via useEffect)
    const nbJoursStage = stageDaysCount || 1;

    // Prix du stage selon le nombre de jours
    // Chercher un tarif configuré pour ce nombre de jours (stocké sur le créneau)
    const configuredPrices: Record<number, number> = {};
    const cr = creneau as any;
    if (cr.price1day) configuredPrices[1] = cr.price1day;
    if (cr.price2days) configuredPrices[2] = cr.price2days;
    if (cr.price3days) configuredPrices[3] = cr.price3days;
    if (cr.price4days) configuredPrices[4] = cr.price4days;

    const prixStageComplet = priceTTC; // = prix semaine complète
    let prixEffectif: number;

    if (stageMode === "jour") {
      // Mode 1 jour : tarif journalier configuré ou prorata
      prixEffectif = configuredPrices[1] || Math.round((prixStageComplet / nbJoursStage) * 100) / 100;
    } else {
      // Mode semaine : tarif configuré pour ce nombre de jours ou prix complet
      prixEffectif = configuredPrices[nbJoursStage] || prixStageComplet;
    }

    const prixJour = Math.round((prixEffectif / (stageMode === "jour" ? 1 : nbJoursStage)) * 100) / 100;

    return selectedChildren.map((childId, idx) => {
      const child = children.find((c: any) => c.id === childId);
      const rang = existingStageCount + idx;
      const remiseEuros = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
      // La réduction s'applique au prorata aussi (mais plafonnée au prix)
      const remiseEffective = stageMode === "jour" ? Math.round((remiseEuros / nbJoursStage) * 100) / 100 : remiseEuros;
      const prixReduit = Math.max(0, Math.round((prixEffectif - remiseEffective) * 100) / 100);
      return {
        childId,
        childName: (child as any)?.lastName
          ? `${(child as any).firstName} ${(child as any).lastName}`
          : ((child as any)?.firstName || "—"),
        prixBase: prixEffectif,
        remiseEuros: remiseEffective,
        rang: rang + 1,
        prixReduit,
      };
    });
  }, [isStage, selectedChildren, children, priceTTC, existingStageCount, stageMode, stageDaysCount, creneau]);

  const stageTotalTTC = stageLines.reduce((s, l) => s + l.prixReduit, 0);
  const stageAcompte = Math.round(stageTotalTTC * 0.3 * 100) / 100;
  const stageSolde = Math.round((stageTotalTTC - stageAcompte) * 100) / 100;

  const handleEnroll = async () => {
    // Mode stage : inscription multi-enfants
    if (isStage && selectedChildren.length > 0 && fam) {
      setEnrolling(true);
      try {
        // Trouver les créneaux à inscrire selon le mode choisi
        let creneauxAInscrire = [creneau];
        if (stageMode === "semaine") {
          const creneauDate = new Date(creneau.date);
          const dayOfWeek = creneauDate.getDay();
          const monday = new Date(creneauDate);
          monday.setDate(monday.getDate() - ((dayOfWeek + 6) % 7));
          const sunday = new Date(monday);
          sunday.setDate(sunday.getDate() + 6);
          const monStr = monday.toISOString().split("T")[0];
          const sunStr = sunday.toISOString().split("T")[0];

          // IMPORTANT: allCreneaux ne contient que la vue courante du planning.
          // Pour les stages en mode semaine, charger TOUS les créneaux de la semaine.
          let stageCreneaux = allCreneaux.filter(c =>
            c.activityTitle === creneau.activityTitle &&
            (c.activityType === "stage" || c.activityType === "stage_journee") &&
            c.date >= monStr && c.date <= sunStr
          ).sort((a, b) => a.date.localeCompare(b.date));

          // Si on n'a trouvé que 1 jour (vue jour), charger depuis Firestore
          if (stageCreneaux.length <= 1) {
            try {
              const weekSnap = await getDocs(query(
                collection(db, "creneaux"),
                where("date", ">=", monStr),
                where("date", "<=", sunStr)
              ));
              const weekCreneaux = weekSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
              stageCreneaux = weekCreneaux.filter(c =>
                c.activityTitle === creneau.activityTitle &&
                (c.activityType === "stage" || c.activityType === "stage_journee")
              ).sort((a, b) => a.date.localeCompare(b.date));
              console.log(`📋 Stage semaine : ${stageCreneaux.length} jours trouvés pour "${creneau.activityTitle}" (${monStr} → ${sunStr})`);
            } catch (e) { console.error("Erreur chargement stage semaine:", e); }
          }

          creneauxAInscrire = stageCreneaux.length > 0 ? stageCreneaux : [creneau];
        }
        // Mode "jour" → juste le créneau cliqué (déjà par défaut)

        // Inscrire chaque enfant dans TOUS les jours du stage (inscription technique seulement, pas de paiement par jour)
        const conflictsFound: string[] = [];
        for (const line of stageLines) {
          for (const sc of creneauxAInscrire) {
            const enrolled = sc.enrolled || [];
            if (enrolled.some((e: any) => e.childId === line.childId)) continue;
            // Vérifier conflit horaire avec un autre créneau ce jour
            const hasConflict = allCreneaux.find(other =>
              other.id !== sc.id &&
              other.date === sc.date &&
              (other.enrolled || []).some((e: any) => e.childId === line.childId) &&
              sc.startTime < other.endTime && other.startTime < sc.endTime
            );
            if (hasConflict) {
              conflictsFound.push(`${line.childName} (${sc.date} : conflit avec ${hasConflict.activityTitle})`);
              continue;
            }
            await onEnroll(sc.id!, {
              childId: line.childId, childName: line.childName,
              familyId: fam.firestoreId, familyName: fam.parentName || "—",
              enrolledAt: new Date().toISOString(),
            }, undefined, { skipPayment: true, skipEmail: true });
          }
        }
        if (conflictsFound.length > 0) {
          panelToast(`Conflits horaires ignorés : ${conflictsFound.join(", ")}`, "warning");
        }

        // Ajouter les lignes au panier de la famille (1 seul paiement pending)
        const newItems = stageLines.map(l => ({
          activityTitle: `${creneau.activityTitle} (${creneauxAInscrire.length}j) — ${l.childName} (-${l.remiseEuros}€ réd. ${l.rang}${l.rang === 1 ? "ère" : "ème"})`,
          childId: l.childId, childName: l.childName,
          stageKey: `${creneau.activityTitle}_${creneau.date}`,
          activityType: creneau.activityType,
          priceHT: l.prixReduit / 1.055, tva: 5.5, priceTTC: l.prixReduit,
        }));

        // Assurance occasionnelle si cochée
        if (assuranceOccasionnelle) {
          for (const line of stageLines) {
            newItems.push({
              activityTitle: `Assurance occasionnelle 1 mois — ${line.childName}`,
              childId: line.childId, childName: line.childName,
              stageKey: `${creneau.activityTitle}_${creneau.date}`,
              activityType: "option",
              priceHT: inscParams.assuranceOccasionnelle / 1.2, tva: 20,
              priceTTC: inscParams.assuranceOccasionnelle,
            });
          }
        }

        // Chercher un paiement pending existant pour cette famille (PANIER UNIQUE)
        const existingSnap = await getDocs(query(
          collection(db, "payments"),
          where("familyId", "==", fam.firestoreId),
          where("status", "==", "pending"),
        ));

        // Prendre la commande ouverte la plus récente — EXCLURE les échéances de forfait
        const pendingDocs = existingSnap.docs
          .filter(d => !(d.data().echeancesTotal > 1))
          .sort((a, b) => {
            const da = a.data().date?.seconds || 0;
            const db2 = b.data().date?.seconds || 0;
            return db2 - da;
          });
        if (pendingDocs.length > 1) {
          console.warn(`⚠️ ${pendingDocs.length} commandes pending pour famille ${fam.firestoreId} — fusion dans la plus récente`);
        }
        const openOrder = pendingDocs.length > 0 ? pendingDocs[0] : null;

        if (openOrder) {
          // Fusionner avec la commande existante
          const existingData = openOrder.data();
          const mergedItems = [...(existingData.items || []), ...newItems];
          const mergedTotal = mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);

          await updateDoc(doc(db, "payments", openOrder.id), {
            items: mergedItems,
            totalTTC: Math.round(mergedTotal * 100) / 100,
            updatedAt: serverTimestamp(),
          });
        } else {
          // Créer une nouvelle commande
          await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
            familyId: fam.firestoreId,
            familyName: fam.parentName || "",
            items: newItems,
            totalTTC: stageTotalTTC,
            paymentMode: "",
            paymentRef: "",
            status: "pending",
            paidAmount: 0,
            date: serverTimestamp(),
          });
        }

        const noms = stageLines.map(l => l.childName).join(", ");
        setJustEnrolled(`${noms} inscrit(s) dans ${creneauxAInscrire.length} jour(s) — ${stageTotalTTC.toFixed(2)}€ — paiement en attente`);

        // Envoyer email de confirmation stage automatiquement
        if (fam.parentEmail) {
          try {
            const dates = creneauxAInscrire.map(c => new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })).join(", ");
            const confirmEmail = emailTemplates.confirmationStage({
              parentName: fam.parentName || "",
              enfants: stageLines.map(l => ({ name: l.childName, prix: l.prixReduit, remise: l.remiseEuros })),
              stageTitle: creneau.activityTitle,
              dates: stageMode === "jour" ? new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : dates,
              totalTTC: stageTotalTTC,
            });
            fetch("/api/send-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: fam.parentEmail, ...confirmEmail }),
            }).catch(e => console.warn("Email stage:", e));

            // Notification push
            fetch("/api/push", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                familyId: fam.firestoreId,
                title: `✅ Inscription confirmée`,
                body: `${noms} inscrit(s) au stage ${creneau.activityTitle}`,
                url: "/espace-cavalier/reservations",
              }),
            }).catch(() => {});
          } catch (e) { console.error("Email confirmation stage:", e); }
        }

        panelToast(`${noms} inscrit(s) — ${stageTotalTTC.toFixed(2)}€ — paiement en attente`, "success");
      } catch (e) { console.error(e); panelToast("Erreur lors de l'inscription", "error"); }
      setSelectedChildren([]);
      setSelFam(""); setSearch(""); setEnrolling(false);
      setTimeout(() => setJustEnrolled(""), 6000);

      // Si mode jour : proposer d'inscrire dans d'autres jours du stage
      if (stageMode === "jour" && fam) {
        const creneauDate = new Date(creneau.date);
        const dow = creneauDate.getDay();
        const mon = new Date(creneauDate); mon.setDate(mon.getDate() - ((dow + 6) % 7));
        const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
        const autresJours = allCreneaux.filter(c =>
          c.activityTitle === creneau.activityTitle &&
          (c.activityType === "stage" || c.activityType === "stage_journee") &&
          new Date(c.date) >= mon && new Date(c.date) <= sun &&
          c.id !== creneau.id
        ).map(c => ({
          id: c.id!,
          date: c.date,
          label: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        }));
        if (autresJours.length > 0) {
          setShowAddDays({
            familyId: fam.firestoreId,
            enfants: stageLines.map(l => ({ childId: l.childId, childName: l.childName })),
            joursRestants: autresJours,
            totalJoursStage: autresJours.length + 1, // tous les jours de la semaine pour ce stage
            joursInscrits: 1, // on vient d'en inscrire 1
            stageTitle: creneau.activityTitle,
            creneauRef: creneau, // pour accéder aux prix multi-jours
          });
        }
      }
      return;
    }

    // Mode cours/forfait : inscription simple
    if (!selChild || !fam) return;
    setEnrolling(true);
    const child = children.find((c: any) => c.id === selChild);
    const childFirstName = (child as any)?.firstName || "—";
    const childLastName = (child as any)?.lastName || "";
    const childName = childLastName ? `${childFirstName} ${childLastName}` : childFirstName;

    const createdPaymentIds: string[] = [];

    if (inscriptionMode === "annuel") {
      // Inscription annuelle : créer le forfait + inscrire dans le créneau
      try {
        const slotKey = `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${creneau.startTime}`;
        await addDoc(collection(db, "forfaits"), {
          familyId: fam.firestoreId,
          familyName: fam.parentName || "",
          childId: selChild,
          childName,
          slotKey,
          activityTitle: creneau.activityTitle,
          dayLabel: new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" }),
          startTime: creneau.startTime,
          endTime: creneau.endTime,
          totalSessions: sessionsRestantes,
          totalSessionsSaison,
          attendedSessions: 0,
          licenceFFE: licence,
          licenceType,
          adhesion,
          prixForfaitAnnuel,
          prorata: Math.round(prorata * 100),
          forfaitPriceTTC: totalAnnuel,
          totalPaidTTC: 0,
          paymentPlan: payPlan,
          status: "actif",
          createdAt: serverTimestamp(),
        });
        // Créer les items pour cet enfant
        const items: any[] = [];
        if (adhesion) items.push({ activityTitle: `Adhésion annuelle (enfant ${rangEnfantFamille})`, childId: selChild, childName, priceHT: prixAdhesionDegressif / 1.055, tva: 5.5, priceTTC: prixAdhesionDegressif });
        if (licence) items.push({ activityTitle: `Licence FFE ${licenceType === "moins18" ? "-18ans" : "+18ans"}`, childId: selChild, childName, priceHT: prixLicence, tva: 0, priceTTC: prixLicence });
        // Créneau principal
        items.push({ activityTitle: `Forfait ${creneau.activityTitle} (${slotKey})`, childId: selChild, childName, creneauId: creneau.id, activityType: creneau.activityType, priceHT: prixForfait / 1.055, tva: 5.5, priceTTC: prixForfait });
        // Créneaux supplémentaires (2ème, 3ème)
        const dayNames = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
        for (const esKey of extraSlots) {
          const firstDash = esKey.indexOf("-");
          const secondDash = esKey.indexOf("-", firstDash + 1);
          const esDow = parseInt(esKey.substring(0, firstDash));
          const esTime = esKey.substring(firstDash + 1, secondDash);
          const esTitle = esKey.substring(secondDash + 1);
          const esSlotLabel = `${esTitle} — ${dayNames[esDow]} ${esTime}`;
          items.push({ activityTitle: `Forfait ${esTitle} (${esSlotLabel})`, childId: selChild, childName, activityType: creneau.activityType, priceHT: 0, tva: 5.5, priceTTC: 0 });
        }

        // Chercher un paiement annuel pending existant pour cette famille (pour regrouper la fratrie)
        const existingPaySnap = await getDocs(query(
          collection(db, "payments"),
          where("familyId", "==", fam.firestoreId),
          where("status", "==", "pending"),
        ));
        // Trouver un paiement forfait annuel non échelonné (écheance 1 ou pas d'écheance)
        const existingForfaitPay = existingPaySnap.docs.find(d => {
          const data = d.data();
          return (data.items || []).some((i: any) => i.activityTitle?.includes("Forfait")) &&
            (!data.echeancesTotal || data.echeancesTotal <= 1) &&
            (!data.echeance || data.echeance <= 1);
        });

        if (existingForfaitPay && payPlan === "1x") {
          // Ajouter les items à la commande existante
          const existingData = existingForfaitPay.data();
          const mergedItems = [...(existingData.items || []), ...items];
          const newTotal = mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);
          await updateDoc(doc(db, "payments", existingForfaitPay.id), {
            items: mergedItems,
            totalTTC: Math.round(newTotal * 100) / 100,
            updatedAt: serverTimestamp(),
          });
          createdPaymentIds.push(existingForfaitPay.id);
          console.log(`📋 Items ajoutés à la commande existante ${existingForfaitPay.id} (${newTotal.toFixed(2)}€)`);
        } else {
          // Créer une nouvelle commande (ou paiement échelonné)
          const nbEcheances = payPlan === "10x" ? 10 : payPlan === "3x" ? 3 : 1;
          const montantEcheance = Math.round((totalAnnuel / nbEcheances) * 100) / 100;
          const montantDerniereEcheance = Math.round((totalAnnuel - montantEcheance * (nbEcheances - 1)) * 100) / 100;

          for (let i = 0; i < nbEcheances; i++) {
            const echeanceDate = new Date();
            echeanceDate.setMonth(echeanceDate.getMonth() + i);
            const montant = i === nbEcheances - 1 ? montantDerniereEcheance : montantEcheance;

            const docRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
              familyId: fam.firestoreId,
              familyName: fam.parentName || "",
              items: i === 0 ? items : [{ activityTitle: `Échéance ${i + 1}/${nbEcheances} — ${childName}`, childId: selChild, childName, priceHT: montant / 1.055, tva: 5.5, priceTTC: montant }],
              totalTTC: montant,
              paymentMode: "",
              paymentRef: "",
              status: "pending",
              paidAmount: 0,
              echeance: i + 1,
              echeancesTotal: nbEcheances,
              echeanceDate: fmtDate(echeanceDate),
              forfaitRef: slotKey,
              date: serverTimestamp(),
            });
            createdPaymentIds.push(docRef.id);
          }
        }
      } catch (e) { console.error(e); }
    }

    // Dans les 2 cas : inscrire dans le créneau
    // Pour les forfaits annuels : skipPayment car les échéances sont déjà créées
    const enrollOptions = inscriptionMode === "annuel" ? { skipPayment: true, skipEmail: true } : undefined;

    if (inscriptionMode === "annuel") {
      // Inscrire dans TOUS les créneaux futurs du même cours (même jour + même heure + même activité)
      // IMPORTANT: allCreneaux ne contient que la semaine affichée, on charge tous les futurs
      const today = new Date().toISOString().split("T")[0];
      const allFutureSnap = await getDocs(
        query(collection(db, "creneaux"), where("date", ">=", today))
      );
      const allFutureCreneaux = allFutureSnap.docs.map(d => ({ id: d.id, ...d.data() })) as (Creneau & { id: string })[];

      // Créneau principal : filtrer par jour + heure + activityTitle + moniteur
      const dow = new Date(creneau.date + "T12:00:00").getDay();
      const slotsToEnroll = allFutureCreneaux.filter(c =>
        c.date >= today &&
        new Date(c.date + "T12:00:00").getDay() === dow &&
        c.startTime === creneau.startTime &&
        c.activityTitle === creneau.activityTitle &&
        (c.monitor || "") === (creneau.monitor || "")
      );

      console.log(`📋 Inscription annuelle : ${slotsToEnroll.length} séances pour "${creneau.activityTitle}" (${creneau.monitor}) (jour ${dow}, ${creneau.startTime})`);

      for (const slot of slotsToEnroll) {
        await onEnroll(slot.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }, undefined, { skipPayment: true, skipEmail: true });
      }

      // Inscrire dans les créneaux supplémentaires (2ème, 3ème)
      // La clé = "dow-startTime-activityTitle-monitor"
      // Au lieu de parser la clé (fragile), on retrouve le slot dans allCreneaux
      for (const slotKey of extraSlots) {
        // Chercher un créneau de la semaine qui correspond à cette clé
        const refCreneau = allCreneaux.find(c => {
          const cdow = new Date(c.date + "T12:00:00").getDay();
          return `${cdow}-${c.startTime}-${c.activityTitle}-${c.monitor || ""}` === slotKey;
        });

        if (!refCreneau) {
          console.warn(`⚠️ Aucun créneau trouvé pour la clé : ${slotKey}`);
          continue;
        }

        const extraDow = new Date(refCreneau.date + "T12:00:00").getDay();
        const extraCreneaux = allFutureCreneaux.filter(c =>
          c.date >= today &&
          new Date(c.date + "T12:00:00").getDay() === extraDow &&
          c.startTime === refCreneau.startTime &&
          c.activityTitle === refCreneau.activityTitle &&
          (c.monitor || "") === (refCreneau.monitor || "")
        );

        console.log(`📋 Créneau supplémentaire : ${extraCreneaux.length} séances pour "${refCreneau.activityTitle}" (${refCreneau.monitor}) (jour ${extraDow}, ${refCreneau.startTime})`);
        for (const slot of extraCreneaux) {
          await onEnroll(slot.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }, undefined, { skipPayment: true, skipEmail: true });
        }
      }
    } else {
      await onEnroll(creneau.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }, inscriptionMode === "ponctuel" && showPay ? payMode : undefined, enrollOptions);
    }

    if (inscriptionMode === "annuel") {
      setJustEnrolled(`${childName} inscrit(e) en forfait annuel — ${sessionsRestantes} séances — ${totalAnnuel.toFixed(2)}€ en ${payPlan}`);
      panelToast(`Forfait créé — ${totalAnnuel.toFixed(2)}€ en ${payPlan}`, "success");
    } else {
      const payInfo = showPay ? " — encaissé ✅" : priceTTC > 0 ? " — paiement en attente" : "";
      setJustEnrolled(`${childName}${payInfo}`);
    }
    setSelChild(""); setSelFam(""); setSearch(""); setEnrolling(false); setShowPay(false); setInscriptionMode("ponctuel"); setExtraSlots([]); setExtraSlotSearch("");
    setTimeout(() => setJustEnrolled(""), 5000);
  };

  const handleUnenroll = async (childId: string) => {
    setUnenrolling(childId);
    await onUnenroll(creneau.id!, childId);
    // Notifier le premier en liste d'attente s'il y en a
    if (waitlist.length > 0) {
      const first = waitlist[0];
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: first.familyEmail,
          subject: `🎉 Une place s'est libérée — ${creneau.activityTitle}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <p>Bonjour <strong>${first.familyName}</strong>,</p>
            <p>Une place vient de se libérer pour <strong>${first.childName}</strong> !</p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;color:#c2410c;font-weight:600;">🔔 ${creneau.activityTitle}</p>
              <p style="margin:8px 0 0;color:#555;font-size:13px;">📅 ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })}</p>
              <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 ${creneau.startTime}–${creneau.endTime}</p>
            </div>
            <p>Connectez-vous à votre espace cavalier pour confirmer l'inscription avant qu'une autre famille ne la prenne.</p>
          </div>`,
        }),
      }).catch(e => console.warn("Email waitlist notif:", e));
    }
    setUnenrolling("");
  };

  // ── Email créneau : envoi à toutes les familles inscrites ──
  const getCreneauRecipients = () => {
    const recipients: { email: string; parentName: string }[] = [];
    const seen = new Set<string>();
    for (const e of enrolled) {
      const fam = families.find(f => f.firestoreId === e.familyId);
      if (fam?.parentEmail && !seen.has(fam.parentEmail)) {
        seen.add(fam.parentEmail);
        recipients.push({ email: fam.parentEmail, parentName: fam.parentName || "" });
      }
    }
    return recipients;
  };

  const handleEmailGenerate = async () => {
    setEmailGenerating(true);
    try {
      const cavaliers = enrolled.map((e: any) => {
        const fam = families.find(f => f.firestoreId === e.familyId);
        const child = (fam?.children || []).find((c: any) => c.id === e.childId);
        return { firstName: e.childName, galopLevel: child?.galopLevel || "—", parentName: e.familyName };
      });
      const res = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email_reprise", creneau, cavaliers }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailSubject(data.suggestedSubject || `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`);
        setEmailBody(data.emailBody || "");
      } else { panelToast("Erreur IA : " + (data.error || ""), "error"); }
    } catch (e: any) { panelToast("Erreur IA : " + e.message, "error"); }
    setEmailGenerating(false);
  };

  const handleEmailSend = async () => {
    const recipients = getCreneauRecipients();
    if (recipients.length === 0) { panelToast("Aucune famille avec email", "error"); return; }
    if (!emailSubject || !emailBody) { panelToast("Sujet et message requis", "error"); return; }
    setEmailSending(true);
    let sent = 0;
    for (const r of recipients) {
      try {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: r.email,
            subject: emailSubject,
            html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;">
              <div style="background:#1e3a5f;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h1 style="color:white;margin:0;font-size:18px;font-weight:700;">Centre Équestre d'Agon-Coutainville</h1>
              </div>
              <div style="background:white;padding:24px;border:1px solid #e8e0d0;border-top:none;">
                ${emailBody.replace(/\n/g, "<br/>")}
              </div>
              <div style="background:#f8f5f0;padding:16px 24px;border-radius:0 0 12px 12px;border:1px solid #e8e0d0;border-top:none;">
                <p style="margin:0;color:#999;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville · 02 44 84 99 96</p>
              </div>
            </div>`,
          }),
        });
        sent++;
      } catch {}
    }
    // Log dans Firestore
    await addDoc(collection(db, "emailsReprise"), {
      creneauId: creneau.id,
      creneauTitle: creneau.activityTitle,
      date: creneau.date,
      subject: emailSubject,
      message: emailBody,
      recipients: recipients.map(r => r.email),
      recipientCount: recipients.length,
      status: "sent",
      createdAt: serverTimestamp(),
    });
    panelToast(`Email envoyé à ${sent} famille${sent > 1 ? "s" : ""}`, "success");
    setShowEmailForm(false);
    setEmailSubject(""); setEmailBody("");
    setEmailSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-blue-500/8" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="flex justify-between items-start"><div><div className="font-body text-sm font-semibold" style={{ color }}>{creneau.startTime}–{creneau.endTime}</div><h2 className="font-display text-lg font-bold text-blue-800">{creneau.activityTitle}</h2><div className="font-body text-xs text-slate-500 mt-1">{new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {creneau.monitor}{displayPrice > 0 ? ` · ${displayPrice.toFixed(2)}€${isStage ? "" : "/séance"}` : ""}</div></div><button onClick={onClose} className="text-slate-500 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button></div>
          <div className="flex items-center gap-3 mt-3">
            <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} place${spots > 1 ? "s" : ""}` : "COMPLET"}</Badge>
            <span className="font-body text-xs text-slate-500">{enrolled.length}/{creneau.maxPlaces}</span>
            {(creneau as any).status === "closed" && <Badge color="gray">Clôturée</Badge>}
          </div>

          {/* ── Plan de séance ── */}
          <div className="mt-3 pt-3 border-t border-blue-500/8">
            <div className="flex items-center justify-between mb-2">
              <span className="font-body text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan de séance</span>
              {!planUploading && (
                <div className="flex gap-1.5">
                  {/* Bouton appareil photo */}
                  <label className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-blue-100">
                    <Camera size={12} /> Photo
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPlan(f); e.target.value = ""; }} />
                  </label>
                  {/* Bouton galerie / fichier */}
                  <label className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-blue-100">
                    <FileImage size={12} /> Galerie / PDF
                    <input ref={planInputRef} type="file" accept="image/*,.pdf,.heic,.heif" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPlan(f); e.target.value = ""; }} />
                  </label>
                </div>
              )}
              {planUploading && <div className="flex items-center gap-1.5 font-body text-xs text-blue-500"><Loader2 size={12} className="animate-spin" /> Upload...</div>}
            </div>

            {planUrl ? (
              <div className="relative group">
                {planType === "application/pdf" ? (
                  <a href={planUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl no-underline hover:bg-red-100">
                    <FileImage size={20} className="text-red-500 flex-shrink-0" />
                    <div>
                      <div className="font-body text-sm font-semibold text-red-700">Plan de séance PDF</div>
                      <div className="font-body text-xs text-red-400">Cliquer pour ouvrir</div>
                    </div>
                  </a>
                ) : (
                  <button onClick={() => openLightbox()} className="w-full border-none p-0 bg-transparent cursor-zoom-in block">
                    <img src={planUrl} alt="Plan de séance" className="w-full rounded-xl object-cover max-h-48 hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                      <span className="font-body text-xs text-white bg-black/50 px-2 py-1 rounded-lg">🔍 Agrandir</span>
                    </div>
                  </button>
                )}
                <button onClick={deletePlan}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                  ✕
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                onClick={() => planInputRef.current?.click()}>
                <Camera size={20} className="text-slate-400 mx-auto mb-1" />
                <p className="font-body text-xs text-slate-500">Photo ou PDF du plan de séance</p>
                <p className="font-body text-[10px] text-slate-400 mt-0.5">Tous formats image · PDF · max 10 Mo</p>
              </div>
            )}
          </div>
        </div>

        {/* Verrou si clôturée */}
        {(creneau as any).status === "closed" && (
          <div className="p-5 bg-gray-50 border-b border-gray-200">
            <p className="font-body text-sm text-slate-600 mb-2">Cette séance est clôturée. Les inscriptions et modifications sont verrouillées.</p>
            <button onClick={async () => {
              if (!confirm("Réouvrir cette séance ?\n\nLes modifications seront à nouveau possibles.\nLes traces pédagogiques et débits de cartes déjà créés ne seront pas affectés.")) return;
              await updateDoc(doc(db, "creneaux", creneau.id!), { status: "planned" });
              onClose();
            }} className="font-body text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-orange-100">
              Réouvrir la séance
            </button>
          </div>
        )}
        <div className="p-5">
          {justEnrolled && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700"><Check size={16} className="inline mr-1" /> {justEnrolled} inscrit(e) !</div>}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-body text-sm font-semibold text-blue-800"><Users size={16} className="inline mr-1"/>Inscrits ({enrolled.length})</h3>
            {enrolled.length > 0 && (
              <button onClick={() => { setShowEmailForm(!showEmailForm); if (!showEmailForm && !emailSubject) setEmailSubject(`${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`); }}
                className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                <Mail size={12} /> Email
              </button>
            )}
          </div>

          {/* ── Formulaire email créneau ── */}
          {showEmailForm && (
            <div className="mb-4 border border-blue-200 rounded-xl overflow-hidden">
              <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between">
                <span className="font-body text-xs font-semibold text-blue-700">📧 Email aux {getCreneauRecipients().length} famille{getCreneauRecipients().length > 1 ? "s" : ""}</span>
                <button onClick={() => setShowEmailForm(false)} className="text-blue-400 hover:text-blue-600 bg-transparent border-none cursor-pointer"><X size={14} /></button>
              </div>
              <div className="p-4 space-y-3">
                <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                  placeholder="Objet de l'email"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                  placeholder="Votre message aux familles..."
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm resize-y focus:outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <button onClick={handleEmailGenerate} disabled={emailGenerating}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-purple-100 disabled:opacity-50">
                    {emailGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Générer avec IA
                  </button>
                  <button onClick={handleEmailSend} disabled={emailSending || !emailSubject || !emailBody}
                    className="flex-1 flex items-center justify-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                    {emailSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Envoyer
                  </button>
                </div>
              </div>
            </div>
          )}
          {enrolled.length === 0 ? <p className="font-body text-sm text-slate-500 italic mb-4">Aucun</p> :
          <div className="flex flex-col gap-2 mb-4">{enrolled.map((e: any) => {
            const isCard = e.paymentSource === "card";
            const hasPaid = isCard || payments.some((p: any) => p.familyId === e.familyId && p.status === "paid" && (p.items||[]).some((i:any) => i.childId === e.childId));
            const hasPending = !hasPaid && payments.some((p: any) => p.familyId === e.familyId && (p.status === "pending" || p.status === "partial") && (p.items||[]).some((i:any) => i.childId === e.childId));
            return (<div key={e.childId} className="flex items-center justify-between bg-sand rounded-lg px-4 py-2.5"><div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><Users size={12} className="text-blue-500" /></div><div><div className="font-body text-sm font-semibold text-blue-800 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${isCard ? "bg-blue-500" : hasPaid ? "bg-green-500" : hasPending ? "bg-orange-400" : "bg-gray-300"}`}></span>{e.childName}{(() => { const fam = families.find(f => f.firestoreId === e.familyId); const child = (fam?.children || []).find((c: any) => c.id === e.childId); const age = calcAge(child?.birthDate); return age ? <span className="font-body text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{age}</span> : null; })()}</div><div className="font-body text-xs text-slate-500">{e.familyName}{isCard ? " · carte" : hasPaid ? " · réglé" : hasPending ? " · en attente" : ""}</div></div></div><button onClick={() => handleUnenroll(e.childId)} disabled={unenrolling===e.childId} className="flex items-center gap-1 font-body text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer px-2 py-1 rounded hover:bg-red-50">{unenrolling===e.childId ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>} Désinscrire</button></div>);
          })}</div>}

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
                  <button
                    onClick={() => acceptWaitlist(entry)}
                    disabled={waitlistLoading || spots <= 0}
                    className={`font-body text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer ${spots > 0 ? "bg-green-500 text-white hover:bg-green-600" : "bg-gray-100 text-slate-400 cursor-not-allowed"} disabled:opacity-50`}>
                    {waitlistLoading ? <Loader2 size={12} className="animate-spin inline" /> : "✓ Accepter"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {spots > 0 && (creneau as any).status !== "closed" && (<div className="border-t border-blue-500/8 pt-4"><h3 className="font-body text-sm font-semibold text-blue-800 mb-3"><UserPlus size={16} className="inline mr-1"/>Inscrire</h3><div className="flex flex-col gap-3">
            {/* Recherche famille */}
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>{setSearch(e.target.value);setSelFam("");setSelChild("");}} placeholder="Nom parent, prénom enfant, email..." className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/></div>
            <select value={selFam} onChange={e=>{setSelFam(e.target.value);setSelChild("");}} className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream"><option value="">Famille ({filteredFamilies.length})</option>{filteredFamilies.map(f=>{const n=(f.children||[]).map((c:any)=>c.firstName).join(", ");return<option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n?`(${n})`:""}</option>})}</select>

            {/* Bouton nouvelle famille */}
            {!selFam && !showNewFamily && (
              <button onClick={() => setShowNewFamily(true)}
                className="flex items-center gap-1.5 font-body text-xs font-semibold text-green-600 bg-green-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-green-100 self-start">
                <UserPlus size={12} /> Nouvelle famille
              </button>
            )}

            {/* Formulaire création famille inline */}
            {showNewFamily && (
              <div className="border border-green-200 rounded-xl overflow-hidden">
                <div className="bg-green-50 px-4 py-2.5 flex items-center justify-between">
                  <span className="font-body text-xs font-semibold text-green-700">👨‍👩‍👧 Nouvelle famille</span>
                  <button onClick={() => setShowNewFamily(false)} className="text-green-400 hover:text-green-600 bg-transparent border-none cursor-pointer"><X size={14} /></button>
                </div>
                <div className="p-4 space-y-2.5">
                  <input value={newFam.parentName} onChange={e => setNewFam({...newFam, parentName: e.target.value})}
                    placeholder="Nom du parent *" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                  <div className="flex gap-2">
                    <input value={newFam.parentEmail} onChange={e => setNewFam({...newFam, parentEmail: e.target.value})}
                      placeholder="Email" type="email" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                    <input value={newFam.parentPhone} onChange={e => setNewFam({...newFam, parentPhone: e.target.value})}
                      placeholder="Téléphone" type="tel" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                  </div>
                  <input value={newFam.address} onChange={e => setNewFam({...newFam, address: e.target.value})}
                    placeholder="Adresse" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                  <div className="flex gap-2">
                    <input value={newFam.zipCode} onChange={e => setNewFam({...newFam, zipCode: e.target.value})}
                      placeholder="Code postal" className="w-28 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                    <input value={newFam.city} onChange={e => setNewFam({...newFam, city: e.target.value})}
                      placeholder="Ville" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                  </div>
                  <div className="border-t border-gray-100 pt-2.5">
                    <div className="font-body text-[10px] text-slate-400 uppercase mb-1.5">Premier cavalier</div>
                    <div className="flex gap-2">
                      <input value={newChild.firstName} onChange={e => setNewChild({...newChild, firstName: e.target.value})}
                        placeholder="Prénom *" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                      <input value={newChild.birthDate} onChange={e => setNewChild({...newChild, birthDate: e.target.value})}
                        type="date" className="w-36 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-green-500" />
                    </div>
                  </div>
                  <button onClick={async () => {
                    if (!newFam.parentName.trim() || !newChild.firstName.trim()) {
                      panelToast("Nom du parent et prénom du cavalier requis", "error");
                      return;
                    }
                    setCreatingFamily(true);
                    try {
                      const childId = `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                      const children = [{
                        id: childId,
                        firstName: newChild.firstName.trim(),
                        birthDate: newChild.birthDate ? new Date(newChild.birthDate) : null,
                        galopLevel: newChild.galopLevel || "—",
                        sanitaryForm: null,
                      }];
                      const famRef = await addDoc(collection(db, "families"), {
                        parentName: newFam.parentName.trim(),
                        parentEmail: newFam.parentEmail.trim(),
                        parentPhone: newFam.parentPhone.trim(),
                        address: newFam.address.trim(),
                        zipCode: newFam.zipCode.trim(),
                        city: newFam.city.trim(),
                        accountType: "particulier",
                        authProvider: "admin",
                        authUid: "",
                        children,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                      });
                      // Email bienvenue
                      if (newFam.parentEmail.trim()) {
                        const emailData = emailTemplates.bienvenueNouvelleFamille({ parentName: newFam.parentName.trim() });
                        fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: newFam.parentEmail.trim(), ...emailData }) }).catch(() => {});
                      }
                      panelToast(`Famille ${newFam.parentName} créée !`, "success");
                      // Sélectionner la nouvelle famille et le cavalier
                      setSelFam(famRef.id);
                      setSelChild(childId);
                      setSearch(newFam.parentName);
                      setShowNewFamily(false);
                      setNewFam({ parentName: "", parentEmail: "", parentPhone: "", address: "", zipCode: "", city: "" });
                      setNewChild({ firstName: "", birthDate: "", galopLevel: "—" });
                      // Rafraîchir les données (le parent va recharger via onClose)
                      onClose();
                    } catch (e: any) {
                      panelToast("Erreur : " + e.message, "error");
                    }
                    setCreatingFamily(false);
                  }} disabled={creatingFamily || !newFam.parentName.trim() || !newChild.firstName.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 disabled:opacity-50">
                    {creatingFamily ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Créer et inscrire
                  </button>
                </div>
              </div>
            )}
            {fam && available.length > 0 && !isStage && <div className="flex flex-wrap gap-2">{available.map((c:any)=><button key={c.id} onClick={()=>setSelChild(c.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${selChild===c.id?"bg-blue-500 text-white border-blue-500":"bg-white text-slate-600 border-gray-200"}`}><Users size={12}/> {c.firstName}</button>)}</div>}

            {/* Stage : sélection multiple d'enfants */}
            {fam && available.length > 0 && isStage && (
              <div>
                <div className="font-body text-xs font-semibold text-slate-500 mb-2">Sélectionner les enfants (multi-sélection)</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {available.map((c: any) => {
                    const sel = selectedChildren.includes(c.id);
                    return (
                      <button key={c.id} onClick={() => setSelectedChildren(sel ? selectedChildren.filter(x => x !== c.id) : [...selectedChildren, c.id])}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${sel ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-gray-200"}`}>
                        {sel ? <Check size={12}/> : <Users size={12}/>} {c.firstName}
                      </button>
                    );
                  })}
                </div>

                {/* Récap stage */}
                {selectedChildren.length > 0 && (() => {
                  // Utiliser stageDaysCount chargé depuis Firestore
                  const nbJours = stageDaysCount || 1;

                  return (
                  <div className="bg-green-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-body text-xs font-semibold text-green-700 uppercase tracking-wider">Récapitulatif stage</div>
                      <Badge color="blue">{stageMode === "semaine" ? `${nbJours} jour${nbJours > 1 ? "s" : ""}` : "1 jour"}</Badge>
                    </div>
                    {/* Choix semaine ou jour */}
                    {nbJours > 1 && (
                      <div className="flex gap-2">
                        <button onClick={() => setStageMode("semaine")}
                          className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${stageMode === "semaine" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                          Semaine complète ({nbJours}j)
                        </button>
                        <button onClick={() => setStageMode("jour")}
                          className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold border cursor-pointer ${stageMode === "jour" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                          Ce jour uniquement
                        </button>
                      </div>
                    )}
                    <div className="font-body text-[10px] text-blue-500 bg-blue-50 rounded px-2 py-1">
                      {stageMode === "semaine"
                        ? `${nbJours} jour${nbJours > 1 ? "s" : ""} — ${priceTTC.toFixed(2)}€`
                        : `1 jour sur ${nbJours} — ${(priceTTC / nbJours).toFixed(2)}€/jour (prorata)`}
                    </div>
                    {existingStageCount > 0 && (
                      <div className="font-body text-[10px] text-orange-500 bg-orange-50 rounded px-2 py-1">
                        {existingStageCount} inscription(s) stage déjà enregistrée(s) pour cette famille — réductions cumulées
                      </div>
                    )}
                    {stageLines.map(l => (
                      <div key={l.childId} className="flex items-center justify-between font-body text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-800 font-semibold">{l.childName}</span>
                          <Badge color="green">-{l.remiseEuros}€ ({l.rang}{l.rang === 1 ? "ère" : "ème"} inscr.)</Badge>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 line-through text-xs mr-1">{l.prixBase.toFixed(2)}€</span>
                          <span className="font-bold text-blue-500">{l.prixReduit.toFixed(2)}€</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-green-200 font-body">
                      <span className="text-sm font-bold text-blue-800">Total à régler</span>
                      <span className="text-2xl font-bold text-green-600">{stageTotalTTC.toFixed(2)}€</span>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="font-body text-xs text-slate-600 text-center">
                        La commande sera ajoutée aux impayés.<br/>
                        Encaissement possible depuis <strong>Paiements → Encaisser</strong>.
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
            )}

            {/* Choix du mode d'inscription — COURS réguliers uniquement */}
            {selChild && !isStage && (() => {
              const isCours = creneau.activityType === "cours" || creneau.activityType === "cours_collectif" || creneau.activityType === "cours_particulier";
              const isBalade = ["balade","promenade","ponyride"].includes(creneau.activityType);
              // SlotKey du créneau courant pour vérification précise du forfait
              const currentSlotKey = `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${creneau.startTime}`;
              // Forfait actif pour CE créneau précis ?
              const hasForfaitPourCeCreneau = allForfaits.some((f: any) => {
                if (f.childId !== selChild || f.status !== "actif") return false;
                const ft = f.activityType || "cours";
                const typeMatch = ft === "all" || (ft === "cours" && isCours) || (ft === "balade" && isBalade);
                if (!typeMatch) return false;
                // Si slotKey défini, doit correspondre exactement
                if (f.slotKey && f.slotKey !== currentSlotKey) return false;
                return true;
              });
              // Détecter une carte active compatible pour cet enfant (seulement si pas de forfait actif)
              const carteActive = hasForfaitPourCeCreneau ? null : allCartes.find((c: any) => {
                if (c.status !== "active" || (c.remainingSessions || 0) <= 0) return false;
                if (c.dateFin && new Date(c.dateFin) < new Date()) return false;
                if (c.familiale) {
                  if (c.familyId !== fam?.firestoreId) return false;
                } else {
                  if (c.childId !== selChild) return false;
                }
                const ct = c.activityType || "cours";
                return (ct === "cours" && isCours) || (ct === "balade" && isBalade);
              });
              return isCours ? (
              <div className="bg-sand rounded-xl p-4 space-y-3">
                <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider">Type d'inscription</div>

                {/* Bannière carte active */}
                {carteActive && (
                  <div className="bg-gold-50 border border-gold-300 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-2xl">🎟️</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-sm font-bold text-gold-700">Carte de séances disponible</div>
                      <div className="font-body text-xs text-gold-600">
                        {carteActive.remainingSessions} séance{carteActive.remainingSessions > 1 ? "s" : ""} restante{carteActive.remainingSessions > 1 ? "s" : ""} · {carteActive.activityType === "balade" ? "Balades" : "Cours"}
                        {carteActive.dateFin ? ` · valide jusqu'au ${new Date(carteActive.dateFin).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })}` : ""}
                      </div>
                      <div className="font-body text-[10px] text-gold-500 mt-0.5">La séance sera débitée à la confirmation de présence au montoir.</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setInscriptionMode("ponctuel")}
                    className={`p-3 rounded-lg border-2 text-left cursor-pointer transition-all ${inscriptionMode === "ponctuel" ? "border-gold-400 bg-gold-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-body text-sm font-semibold text-blue-800">Séance ponctuelle</div>
                    {carteActive ? (
                      <>
                        <div className="font-body text-xs text-gold-600 mt-0.5">Débit sur la carte 🎟️</div>
                        <div className="font-body text-lg font-bold text-gold-500 mt-1">0€</div>
                      </>
                    ) : (
                      <>
                        <div className="font-body text-xs text-slate-500 mt-0.5">Paiement à l'unité</div>
                        {priceTTC > 0 && <div className="font-body text-lg font-bold text-blue-500 mt-1">{priceTTC.toFixed(2)}€</div>}
                      </>
                    )}
                  </button>
                  <button onClick={() => setInscriptionMode("annuel")}
                    className={`p-3 rounded-lg border-2 text-left cursor-pointer transition-all ${inscriptionMode === "annuel" ? "border-green-500 bg-green-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-body text-sm font-semibold text-green-700">Forfait à l'année</div>
                    <div className="font-body text-xs text-slate-500 mt-0.5">{sessionsRestantes} séances restantes × {frequenceCours}× ({sessionsRestantes * frequenceCours} total)</div>
                    <div className="font-body text-lg font-bold text-green-600 mt-1">{totalAnnuel.toFixed(2)}€</div>
                    {prorata < 1 && <div className="font-body text-[10px] text-orange-500 mt-0.5">Prorata : {Math.round(prorata * 100)}% du tarif annuel</div>}
                  </button>
                </div>

                {/* Mode ponctuel */}
                {inscriptionMode === "ponctuel" && priceTTC > 0 && (
                  <div className="bg-white rounded-lg p-3">
                    {carteActive ? (
                      <div className="font-body text-xs text-gold-600 bg-gold-50 rounded-lg px-3 py-2">
                        🎟️ La carte sera débitée automatiquement à la clôture du montoir si l'enfant est présent. Aucun paiement à encaisser maintenant.
                      </div>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={showPay} onChange={e => setShowPay(e.target.checked)} className="accent-blue-500 w-4 h-4"/>
                          <span className="font-body text-sm text-blue-800 font-semibold">Encaisser maintenant ({priceTTC.toFixed(2)}€)</span>
                        </label>
                        <div className="font-body text-[10px] text-slate-500 mt-1 ml-6">
                          {showPay ? "Le paiement sera enregistré immédiatement dans le journal." : "La prestation sera ajoutée aux impayés de la famille."}
                        </div>
                        {showPay && <div className="flex flex-wrap gap-1.5 mt-2">{payModes.filter(m => m.id !== "carte").map(m=><button key={m.id} onClick={()=>setPayMode(m.id)} className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${payMode===m.id?"bg-blue-500 text-white border-blue-500":"bg-white text-slate-600 border-gray-200"}`}>{m.icon} {m.label}</button>)}</div>}
                      </>
                    )}
                  </div>
                )}

                {/* Mode annuel */}
                {inscriptionMode === "annuel" && (
                  <div className="bg-white rounded-lg p-3 space-y-3">
                    <div className="font-body text-xs font-semibold text-green-600 uppercase tracking-wider">Détail du forfait</div>

                    {/* Fréquence hebdomadaire */}
                    <div>
                      <div className="font-body text-xs text-slate-500 mb-2">Fréquence hebdomadaire</div>
                      <div className="flex gap-2">
                        {([1, 2, 3] as const).map(f => (
                          <button key={f} onClick={() => { setFrequenceCours(f); setExtraSlots([]); setExtraSlotSearch(""); }}
                            className={`flex-1 py-2 rounded-lg border font-body text-sm font-semibold cursor-pointer transition-all ${frequenceCours === f ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-slate-500"}`}>
                            {f}×/sem
                            <div className="font-body text-[10px] font-normal mt-0.5">
                              {f === 1 ? inscParams.forfait1x : f === 2 ? inscParams.forfait2x : inscParams.forfait3x}€/an
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Créneaux supplémentaires si 2×/sem ou 3×/sem */}
                    {frequenceCours >= 2 && (() => {
                      const creneauDow = new Date(creneau.date + "T12:00:00").getDay();
                      const creneauKey = `${creneauDow}-${creneau.startTime}-${creneau.activityTitle}-${creneau.monitor || ""}`;
                      // Tous les créneaux sauf stages et le créneau principal
                      const autresSlots = allCreneaux.filter(c =>
                        c.activityType !== "stage" &&
                        c.activityType !== "stage_journee" &&
                        c.id !== creneau.id
                      );
                      const uniqueSlots = [...new Map(autresSlots.map(c => {
                        const dow = new Date(c.date + "T12:00:00").getDay();
                        const key = `${dow}-${c.startTime}-${c.activityTitle}-${c.monitor || ""}`;
                        return [key, { key, dow, startTime: c.startTime, endTime: c.endTime, activityTitle: c.activityTitle, activityId: c.activityId, monitor: c.monitor || "", label: `${["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"][dow]} ${c.startTime}` }];
                      })).values()].filter(s => s.key !== creneauKey); // Exclure le créneau principal

                      // Filtrer par recherche
                      const searchFiltered = extraSlotSearch.trim()
                        ? uniqueSlots.filter(s =>
                            s.activityTitle.toLowerCase().includes(extraSlotSearch.toLowerCase()) ||
                            s.label.toLowerCase().includes(extraSlotSearch.toLowerCase())
                          )
                        : uniqueSlots;

                      const maxExtra = frequenceCours - 1; // 1 extra pour 2×, 2 extras pour 3×

                      const toggleExtraSlot = (key: string) => {
                        setExtraSlots(prev => {
                          if (prev.includes(key)) return prev.filter(k => k !== key);
                          if (prev.length >= maxExtra) return prev;
                          return [...prev, key];
                        });
                      };

                      return (
                        <div>
                          <div className="font-body text-xs text-slate-500 mb-2">
                            {frequenceCours === 2 ? "2ème" : "2ème et 3ème"} créneau hebdomadaire <span className="text-red-500">*</span>
                            {extraSlots.length > 0 && <span className="text-green-600 ml-1">({extraSlots.length}/{maxExtra})</span>}
                          </div>

                          {/* Barre de recherche */}
                          <div className="relative mb-2">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input value={extraSlotSearch} onChange={e => setExtraSlotSearch(e.target.value)}
                              placeholder="Rechercher cours, jour, horaire..."
                              className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-gray-200 font-body text-xs bg-white focus:border-blue-400 focus:outline-none" />
                          </div>

                          {/* Badges des créneaux sélectionnés */}
                          {extraSlots.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {extraSlots.map((key, i) => {
                                const s = uniqueSlots.find(us => us.key === key);
                                return s ? (
                                  <span key={key} className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded font-body text-[10px] font-semibold">
                                    {s.activityTitle} — {s.label}{s.monitor ? ` (${s.monitor})` : ""}
                                    <button onClick={() => setExtraSlots(prev => prev.filter(k => k !== key))} className="text-green-400 hover:text-red-500 bg-transparent border-none cursor-pointer"><X size={10} /></button>
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}

                          {/* Liste des slots */}
                          <div className="max-h-36 overflow-auto flex flex-wrap gap-1.5">
                            {searchFiltered.length === 0 ? (
                              <p className="font-body text-[10px] text-gray-400 py-2">
                                {extraSlotSearch ? `Aucun créneau pour « ${extraSlotSearch} »` : "Aucun autre créneau cours disponible"}
                              </p>
                            ) : searchFiltered.map(s => {
                              const isSelected = extraSlots.includes(s.key);
                              const maxReached = !isSelected && extraSlots.length >= maxExtra;
                              const isDisabled = maxReached;
                              return (
                                <button key={s.key} onClick={() => !isDisabled && toggleExtraSlot(s.key)}
                                  className={`px-3 py-1.5 rounded-lg border font-body text-xs cursor-pointer transition-all ${
                                    isSelected ? "border-green-500 bg-green-50 text-green-700 font-semibold" :
                                    isDisabled ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed" :
                                    "border-gray-200 bg-white text-slate-600 hover:border-green-300"
                                  }`} title={`${s.activityTitle} — ${s.monitor || "?"}`}>
                                  <span className="text-[10px] opacity-60 mr-1">{s.activityTitle}</span>
                                  {s.label}
                                  {s.monitor && <span className="text-[9px] opacity-50 ml-1">({s.monitor})</span>}
                                  {isSelected && <Check size={10} className="inline ml-1" />}
                                </button>
                              );
                            })}
                          </div>
                          {extraSlots.length < maxExtra && <p className="font-body text-[10px] text-red-500 mt-1">Sélectionnez {maxExtra - extraSlots.length} créneau(x) supplémentaire(s)</p>}
                        </div>
                      );
                    })()}

                    {/* Adhésion dégressive */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={adhesion} onChange={e => setAdhesion(e.target.checked)} className="accent-green-500 w-4 h-4"/>
                        <div>
                          <span className="font-body text-sm text-blue-800">Adhésion annuelle</span>
                          {rangEnfantFamille > 1 && <span className="font-body text-[10px] text-orange-500 ml-2">{rangEnfantFamille === 2 ? "2ème" : rangEnfantFamille === 3 ? "3ème" : "4ème+"} enfant</span>}
                        </div>
                      </div>
                      <span className="font-body text-sm font-semibold text-blue-500">{prixAdhesionDegressif}€</span>
                    </label>
                    {/* Licence FFE */}
                    <div>
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={licence} onChange={e => setLicence(e.target.checked)} className="accent-green-500 w-4 h-4"/>
                          <span className="font-body text-sm text-blue-800">Licence FFE</span>
                        </div>
                        <span className="font-body text-sm font-semibold text-blue-500">{prixLicence}€</span>
                      </label>
                      {licence && (
                        <div className="flex gap-2 mt-1.5 ml-6">
                          <button onClick={() => setLicenceType("moins18")} className={`px-3 py-1 rounded-lg font-body text-xs cursor-pointer border ${licenceType === "moins18" ? "bg-green-500 text-white border-green-500" : "bg-white text-slate-600 border-gray-200"}`}>-18 ans (25€)</button>
                          <button onClick={() => setLicenceType("plus18")} className={`px-3 py-1 rounded-lg font-body text-xs cursor-pointer border ${licenceType === "plus18" ? "bg-green-500 text-white border-green-500" : "bg-white text-slate-600 border-gray-200"}`}>+18 ans (36€)</button>
                        </div>
                      )}
                    </div>
                    {/* Forfait */}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-sm text-blue-800">Forfait {creneau.activityTitle}</span>
                        <span className="font-body text-sm font-semibold text-blue-500">{prixForfait}€</span>
                      </div>
                      <div className="font-body text-[10px] text-slate-500 mt-0.5">
                        {sessionsRestantes * frequenceCours} séances restantes ({frequenceCours}×/sem) — prorata {Math.round(prorata*100)}%
                        {prorata < 1 && <> · {prixForfaitAnnuel}€ × {Math.round(prorata*100)}% = {prixForfait}€</>}
                        {prorata >= 1 && <> · Tarif plein (début de saison)</>}
                      </div>
                    </div>
                    {/* Total */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="font-body text-sm font-bold text-blue-800">Total</span>
                      <span className="font-body text-lg font-bold text-green-600">{totalAnnuel.toFixed(2)}€</span>
                    </div>
                    {/* Plan de paiement */}
                    <div>
                      <div className="font-body text-[10px] text-slate-500 mb-1">Plan de paiement</div>
                      <div className="flex gap-2">
                        {(["1x", "3x", "10x"] as const).map(p => (
                          <button key={p} onClick={() => setPayPlan(p)} className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold cursor-pointer border ${payPlan === p ? "bg-green-500 text-white border-green-500" : "bg-white text-slate-600 border-gray-200"}`}>
                            {p === "1x" ? `1× ${totalAnnuel.toFixed(0)}€` : p === "3x" ? `3× ${(totalAnnuel / 3).toFixed(0)}€` : `10× ${(totalAnnuel / 10).toFixed(0)}€`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Activités ponctuelles (balade, promenade, animation) — encaissement direct */
              <div className="bg-sand rounded-xl p-4 space-y-3">
                {priceTTC > 0 && (
                  <div>
                    <div className="font-body text-lg font-bold text-blue-500 mb-2">{priceTTC.toFixed(2)}€</div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showPay} onChange={e => setShowPay(e.target.checked)} className="accent-blue-500 w-4 h-4"/>
                      <span className="font-body text-sm text-blue-800 font-semibold">Encaisser maintenant</span>
                    </label>
                    <div className="font-body text-[10px] text-slate-500 mt-1 ml-6">
                      {showPay ? "Le paiement sera enregistré immédiatement." : "Ajouté aux impayés de la famille."}
                    </div>
                    {showPay && <div className="flex flex-wrap gap-1.5 mt-2">{payModes.map(m=><button key={m.id} onClick={()=>setPayMode(m.id)} className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${payMode===m.id?"bg-blue-500 text-white border-blue-500":"bg-white text-slate-600 border-gray-200"}`}>{m.icon} {m.label}</button>)}</div>}
                  </div>
                )}
              </div>
            );
            })()}

            {/* Bouton Stage */}
            {isStage && selectedChildren.length > 0 && (
              <div className="flex flex-col gap-2">
                {/* Option assurance occasionnelle */}
                <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-orange-200 bg-orange-50 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={assuranceOccasionnelle} onChange={e => setAssuranceOccasionnelle(e.target.checked)} className="accent-orange-500 w-4 h-4"/>
                    <div>
                      <div className="font-body text-sm font-semibold text-orange-800">🛡️ Assurance occasionnelle 1 mois</div>
                      <div className="font-body text-[10px] text-orange-600">Pour cavaliers non licenciés FFE — {inscParams.assuranceOccasionnelle}€/enfant</div>
                    </div>
                  </div>
                  {assuranceOccasionnelle && <span className="font-body text-sm font-bold text-orange-700">+{inscParams.assuranceOccasionnelle * selectedChildren.length}€</span>}
                </label>
                <button onClick={handleEnroll} disabled={enrolling} className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${enrolling ? "bg-gray-200 text-slate-500" : "bg-green-600 text-white hover:bg-green-500"}`}>
                  {enrolling ? "..." : `Inscrire ${selectedChildren.length} enfant${selectedChildren.length > 1 ? "s" : ""} — ${(stageTotalTTC + (assuranceOccasionnelle ? inscParams.assuranceOccasionnelle * selectedChildren.length : 0)).toFixed(2)}€`}
                </button>
              </div>
            )}

            {/* Bouton Cours / Activité ponctuelle */}
            {!isStage && selChild && (
              <button onClick={handleEnroll} disabled={!selChild||enrolling||(inscriptionMode==="annuel"&&frequenceCours>=2&&extraSlots.length<frequenceCours-1)} className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${(!selChild||enrolling||(inscriptionMode==="annuel"&&frequenceCours>=2&&extraSlots.length<frequenceCours-1))?"bg-gray-200 text-slate-500":inscriptionMode==="annuel"?"bg-green-600 text-white hover:bg-green-500":"bg-blue-500 text-white hover:bg-blue-400"}`}>
                {enrolling ? "..." : inscriptionMode === "annuel" ? `Inscrire à l'année (${totalAnnuel.toFixed(2)}€)` : showPay ? `Inscrire + Encaisser (${priceTTC.toFixed(2)}€)` : priceTTC > 0 ? `Inscrire — paiement en attente (${priceTTC.toFixed(2)}€)` : "Inscrire"}
              </button>
            )}
          </div></div>)}

          {/* Panel proposant d'autres jours après inscription jour */}
          {showAddDays && (
            <div className="border-t border-green-200 p-4 bg-green-50/50">
              <div className="font-body text-sm font-semibold text-green-700 mb-2">
                Inscrire aussi dans d'autres jours ?
              </div>
              <p className="font-body text-xs text-slate-600 mb-3">
                {showAddDays.enfants.map(e => e.childName).join(", ")} inscrit(s) pour 1 jour. Voulez-vous ajouter d'autres jours du même stage ?
              </p>
              <div className="flex flex-col gap-1.5 mb-3">
                {showAddDays.joursRestants.map(j => (
                  <button key={j.id} onClick={async () => {
                    setEnrolling(true);
                    try {
                      const fam2 = families.find(f => f.firestoreId === showAddDays.familyId);
                      if (fam2) {
                        for (const enfant of showAddDays.enfants) {
                          await onEnroll(j.id, {
                            childId: enfant.childId, childName: enfant.childName,
                            familyId: showAddDays.familyId, familyName: fam2.parentName || "—",
                            enrolledAt: new Date().toISOString(),
                          }, undefined, { skipPayment: true, skipEmail: true });
                        }
                      }
                      // Recalcul tarif : jours inscrits AVANT + 1 (ce jour qu'on vient d'ajouter)
                      try {
                        const paySnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", showAddDays.familyId), where("status", "==", "pending")));
                        const stagePayment = paySnap.docs.find(d => {
                          const items = d.data().items || [];
                          return items.some((i: any) => (i.activityType === "stage" || i.activityType === "stage_journee") && i.stageKey?.includes(showAddDays.stageTitle));
                        }) || paySnap.docs.find(d => {
                          const items = d.data().items || [];
                          return items.some((i: any) => i.activityType === "stage" || i.activityType === "stage_journee");
                        });
                        if (stagePayment) {
                          const pData = stagePayment.data();
                          const oldItems = pData.items || [];
                          const totalDaysNow = showAddDays.joursInscrits + 1;
                          const cr = showAddDays.creneauRef as any;
                          const prices: Record<number, number> = {};
                          if (cr.price1day) prices[1] = cr.price1day;
                          if (cr.price2days) prices[2] = cr.price2days;
                          if (cr.price3days) prices[3] = cr.price3days;
                          if (cr.price4days) prices[4] = cr.price4days;
                          const priceKeys = Object.keys(prices).map(Number).sort((a,b) => a-b);
                          const maxKey = priceKeys.at(-1) || 1;
                          // Prix de base pour le nouveau nombre de jours
                          const prixBase = prices[totalDaysNow] || prices[priceKeys.filter(k => k <= totalDaysNow).at(-1) || maxKey] || prices[maxKey] || 0;

                          // Recalcul individuel par enfant — préserve les remises par rang dans la fratrie
                          const stageItems = oldItems.filter((i: any) => i.activityType === "stage" || i.activityType === "stage_journee");
                          const updatedItems = oldItems.map((item: any) => {
                            if (item.activityType !== "stage" && item.activityType !== "stage_journee") return item;
                            // Trouver le rang de cet enfant parmi les items stage
                            const rang = stageItems.findIndex((si: any) => si.childId === item.childId);
                            // Remise selon rang : 0% pour le 1er, 10% pour le 2e, 20% pour le 3e, etc.
                            const remisePct = rang <= 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
                            const remiseEuros = Math.round(prixBase * remisePct / 100 * 100) / 100;
                            const newPriceTTC = Math.max(0, Math.round((prixBase - remiseEuros) * 100) / 100);
                            return { ...item, priceTTC: newPriceTTC, priceHT: Math.round(newPriceTTC / 1.055 * 100) / 100 };
                          });
                          const newTotal = Math.round(updatedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0) * 100) / 100;
                          await updateDoc(doc(db, "payments", stagePayment.id), {
                            items: updatedItems, totalTTC: newTotal, updatedAt: serverTimestamp(),
                          });
                        }
                      } catch (e) { console.error("Erreur mise à jour tarif stage:", e); }
                      setJustEnrolled(`${showAddDays.enfants.map(e => e.childName).join(", ")} ajouté(s) le ${j.label}`);
                      const remaining = showAddDays.joursRestants.filter(jr => jr.id !== j.id);
                      if (remaining.length > 0) {
                        setShowAddDays({ ...showAddDays, joursRestants: remaining, joursInscrits: showAddDays.joursInscrits + 1 });
                      } else {
                        setShowAddDays(null);
                      }
                    } catch (e) { console.error(e); }
                    setEnrolling(false);
                    setTimeout(() => setJustEnrolled(""), 4000);
                  }}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-green-200 bg-white font-body text-sm cursor-pointer hover:bg-green-50 text-left">
                    <span className="text-blue-800 font-medium">{j.label}</span>
                    <span className="text-green-600 text-xs font-semibold">+ Ajouter</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddDays(null)}
                className="w-full py-2 rounded-lg font-body text-xs text-slate-600 bg-gray-100 border-none cursor-pointer">
                Terminé
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Lightbox photo plan de séance ── */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4"
          onClick={closeLightbox}>
          <div className="relative max-w-4xl max-h-full w-full" onClick={e => e.stopPropagation()}>
            {!lightboxBlobUrl ? (
              <div className="flex items-center justify-center h-64 text-white">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
              </div>
            ) : lightboxBlobUrl.startsWith("cors_error:") ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-white text-center p-6">
                <div className="text-4xl">🔒</div>
                <p className="font-body text-sm">Aperçu bloqué par la politique CORS de Firebase Storage.</p>
                <a href={lightboxBlobUrl.replace("cors_error:", "")} target="_blank" rel="noopener noreferrer"
                  className="font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 px-4 py-2.5 rounded-xl no-underline">
                  Ouvrir dans un nouvel onglet →
                </a>
                <p className="font-body text-[10px] text-white/50">Solution définitive : configurer les règles CORS dans Firebase Storage</p>
              </div>
            ) : (
              <img src={lightboxBlobUrl} alt="Plan de séance"
                className="w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            )}
            <button onClick={closeLightbox}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center border-none cursor-pointer hover:bg-black/80 text-lg">
              ✕
            </button>
            {lightboxBlobUrl && (
              <a href={lightboxBlobUrl} download="plan-seance" target="_blank" rel="noopener noreferrer"
                className="absolute bottom-3 right-3 flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-black/60 hover:bg-black/80 px-3 py-2 rounded-lg no-underline">
                ⬇ Télécharger
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EnrollPanel;
