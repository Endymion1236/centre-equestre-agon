"use client";
import { useState } from "react";
import ProgressionEditor from "@/components/ProgressionEditor";
import PedaSuiviCard from "@/components/PedaSuiviCard";
import { doc, updateDoc, addDoc, collection, getDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Badge } from "@/components/ui";
import { Wallet, UserPlus, X, Trash2, CalendarDays, Plus, Save, Loader2, ChevronDown, Camera, Eye } from "lucide-react";
import { downloadInvoicePdf } from "@/lib/download-invoice";

const modeLabels: Record<string, string> = {
  cb_terminal: "CB", cb_online: "CB en ligne", cheque: "Chèque",
  especes: "Espèces", cheque_vacances: "Chq. Vac.", pass_sport: "Pass'Sport",
  ancv: "ANCV", virement: "Virement", avoir: "Avoir", prelevement_sepa: "SEPA",
};

// Jours avant le prochain anniversaire (0 = aujourd'hui), null si date invalide
function daysToNextBirthday(birthDate: any): number | null {
  if (!birthDate) return null;
  const bd = new Date(typeof birthDate === "string" ? birthDate : birthDate?.seconds ? birthDate.seconds * 1000 : birthDate);
  if (isNaN(bd.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export default function FamilyDetailTabs({ family, children, allReservations, allPayments, allAvoirs, allCartes, allMandats, allFidelite, allCreneaux = [], fetchFamilies, onEditChild, onDeleteChild, onMoveChild, onEditSanitary, onEditGalop, onInscribe, onBilanPdf }: {
  family: any; children: any[]; allReservations: any[]; allPayments: any[];
  allAvoirs: any[]; allCartes: any[]; allMandats: any[]; allFidelite: any[]; allCreneaux?: any[];
  fetchFamilies: () => void;
  onEditChild?: (child: any) => void;
  onDeleteChild?: (childId: string, childName: string) => void;
  onMoveChild?: (child: any) => void;
  onEditSanitary?: (child: any) => void;
  onEditGalop?: (childId: string) => void;
  onInscribe?: (childId: string, childName: string) => void;
  onBilanPdf?: (child: any) => void;
}) {
  const childTabs = children.map((c: any) => ({ id: `child_${c.id}`, label: `🧒 ${c.firstName || "?"}`, childId: c.id }));
  const familyTabs = [
    { id: "paiements", label: "💳 Paiements" },
    { id: "divers", label: "🗂 Divers" },
    { id: "notes", label: "📝 Notes" },
  ];
  const allTabs = [...childTabs, ...familyTabs];
  const [tab, setTab] = useState(childTabs[0]?.id || "paiements");
  // Relance attestation (anti double-envoi) + upload photo cavalier
  const [relanceSent, setRelanceSent] = useState<Record<string, boolean>>({});
  const [relanceSending, setRelanceSending] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  // Lightbox photo : agrandir au clic + choix prendre une photo / fichier
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);

  const relancerAttestation = async (child: any) => {
    if (!family.parentEmail) { alert("Pas d'email renseigné pour cette famille."); return; }
    setRelanceSending(child.id);
    try {
      const res = await authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: family.parentEmail,
          subject: `📋 Attestation médicale manquante — ${child.firstName}`,
          context: "admin_relance_attestation",
          familyId: family.firestoreId || family.id,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <p>Bonjour <strong>${family.parentName || ""}</strong>,</p>
            <p>Pour que <strong>${child.firstName}</strong> puisse monter en toute sécurité, il nous manque encore sa <strong>fiche sanitaire et attestation médicale</strong>.</p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;color:#9a3412;font-size:14px;">📝 Connectez-vous à votre espace famille, rubrique <strong>Profil</strong>, pour compléter la fiche sanitaire de ${child.firstName} (allergies, contact d'urgence, attestation).</p>
            </div>
            <p style="color:#555;font-size:13px;">Cela ne prend que 2 minutes. Merci !</p>
            <p style="color:#666;font-size:12px;">À bientôt au centre équestre !</p>
          </div>`,
        }),
      });
      if (!res.ok) throw new Error();
      setRelanceSent(prev => ({ ...prev, [child.id]: true }));
    } catch { alert("Échec de l'envoi de la relance."); }
    setRelanceSending(null);
  };

  // Compression côté client : une photo de smartphone fait 3-12 Mo ; on la
  // ramène à un carré JPEG de 512px (~40 Ko) avant upload — affichage
  // instantané des avatars et Storage léger.
  const compressPhoto = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        // Recadrage carré centré (cover)
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob")), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });

  const uploadPhoto = async (child: any, file: File) => {
    setPhotoUploading(child.id);
    try {
      const blob = await compressPhoto(file).catch(() => file); // fallback : original si compression impossible
      const storageRef = ref(storage, `cavaliers/${family.firestoreId || family.id}/${child.id}.jpg`);
      const task = uploadBytesResumable(storageRef, blob, { contentType: "image/jpeg" });
      await new Promise<void>((res, rej) => task.on("state_changed", undefined, rej, () => res()));
      const url = await getDownloadURL(storageRef);
      const famSnap = await getDoc(doc(db, "families", family.firestoreId || family.id));
      if (famSnap.exists()) {
        const data = famSnap.data() as any;
        const updated = (data.children || []).map((c: any) => c.id === child.id ? { ...c, photoUrl: url } : c);
        await updateDoc(doc(db, "families", family.firestoreId || family.id), { children: updated });
        fetchFamilies();
      }
    } catch (e) { console.error("Photo cavalier:", e); alert("Échec de l'upload de la photo."); }
    setPhotoUploading(null);
  };

  // UX fiche cavalier : menu ⋯ (actions rares), sections repliées par défaut
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [pastExpanded, setPastExpanded] = useState<string | null>(null);
  const [sanitaryExpanded, setSanitaryExpanded] = useState<string | null>(null);

  const [editingMandat, setEditingMandat] = useState(false);
  const [mandatForm, setMandatForm] = useState({ iban: "", bic: "", titulaire: family.parentName || "", dateSignature: new Date().toISOString().split("T")[0], address: family.address || "", zipCode: family.zipCode || "", city: family.city || "" });
  const [mandatSaving, setMandatSaving] = useState(false);
  // Photo de l'autorisation de prélèvement signée. scanOverride :
  //   undefined = pas de changement (on affiche mandat.scanUrl)
  //   string    = URL fraîchement uploadée
  //   null      = retirée
  const [scanUploading, setScanUploading] = useState(false);
  const [scanOverride, setScanOverride] = useState<string | null | undefined>(undefined);
  const [mandatPdfLoading, setMandatPdfLoading] = useState(false);

  // Télécharger l'autorisation de prélèvement pré-remplie (PDF), même sans email ni mandat existant.
  const downloadMandatePdf = async () => {
    setMandatPdfLoading(true);
    try {
      const res = await authFetch("/api/admin/sepa-mandate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: family.firestoreId }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (family.parentName || "famille").replace(/[^a-zA-Z0-9._-]/g, "_");
      a.download = `autorisation-prelevement-${safe}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Échec de la génération de l'autorisation."); }
    finally { setMandatPdfLoading(false); }
  };
  // Quel enfant a sa liste de séances entièrement dépliée (par childId).
  const [seancesExpanded, setSeancesExpanded] = useState<string | null>(null);
  // Progression FFE repliée par défaut (bloc volumineux) : on stocke l'id de
  // l'enfant dont la progression est dépliée.
  const [progressionExpanded, setProgressionExpanded] = useState<string | null>(null);
  // Stats de progression par enfant (remontées par ProgressionEditor quand il
  // est monté), pour afficher le % FFE dans l'en-tête de l'accordéon.
  const [progressionStats, setProgressionStats] = useState<Record<string, { pctFFE: number }>>({});

  const handleSaveMandat = async () => {
    if (!mandatForm.iban || !mandatForm.titulaire) return;
    setMandatSaving(true);
    try {
      const cleanIban = mandatForm.iban.replace(/\s/g, "").toUpperCase();
      // L'adresse du titulaire est enregistrée sur la fiche famille (réutilisée
      // par l'autorisation pré-remplie, qui la lit automatiquement).
      await updateDoc(doc(db, "families", fid), {
        address: mandatForm.address.trim(),
        zipCode: mandatForm.zipCode.trim(),
        city: mandatForm.city.trim(),
        updatedAt: serverTimestamp(),
      });
      if (mandat) {
        await updateDoc(doc(db, "mandats-sepa", mandat.id), { iban: cleanIban, bic: mandatForm.bic, titulaire: mandatForm.titulaire, dateSignature: mandatForm.dateSignature, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "mandats-sepa"), { familyId: fid, familyName: family.parentName, iban: cleanIban, bic: mandatForm.bic, titulaire: mandatForm.titulaire, mandatId: `SEPA-${Date.now().toString(36).toUpperCase()}`, dateSignature: mandatForm.dateSignature, status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      setEditingMandat(false); fetchFamilies();
    } catch (e) { console.error(e); }
    setMandatSaving(false);
  };

  const fid = family.firestoreId;
  const today = new Date().toISOString().split("T")[0];
  const reservations = allReservations.filter((r: any) => r.familyId === fid || r.sourceFamilyId === fid);
  const payments = allPayments.filter((p: any) => p.familyId === fid && p.status !== "cancelled");
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.paidAmount || p.totalTTC || 0), 0);
  const totalFacture = payments.reduce((s: number, p: any) => s + (p.totalTTC || 0), 0);
  const totalDue = Math.max(0, totalFacture - totalPaid);
  const avoirs = allAvoirs.filter((a: any) => a.familyId === fid);
  const famCartes = allCartes.filter((c: any) => c.familyId === fid);
  const mandat = allMandats.find((m: any) => m.familyId === fid && m.status === "active");
  const fidData = allFidelite.find((f: any) => f.id === fid);
  const currentChildId = tab.startsWith("child_") ? tab.replace("child_", "") : null;
  const currentChild = currentChildId ? children.find((c: any) => c.id === currentChildId) : null;

  return (
    <div className="mt-3 pt-3 border-t border-blue-500/8">
      {/* Nav onglets — enfants */}
      <div className="mb-1">
        <div className="font-body text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Cavaliers</div>
        <div className="flex gap-1.5 flex-wrap">
          {childTabs.map(({ id, label }) => {
            const cid = id.replace("child_", "");
            const childBadge = reservations.filter((r: any) => r.childId === cid && r.date >= today && r.status !== "cancelled").length;
            return (
              <button key={id} onClick={() => setTab(id)}
                className={`font-body text-xs px-4 py-2 rounded-xl border-none cursor-pointer transition-all flex items-center gap-1.5 ${tab === id ? "bg-blue-500 text-white font-semibold shadow-sm" : "text-blue-800 bg-blue-50 hover:bg-blue-100"}`}>
                {label}
                {childBadge > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20" : "bg-blue-200/60 text-blue-600"}`}>{childBadge}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {/* Nav onglets — famille */}
      <div className="mb-3 pb-2 border-b border-gray-100">
        <div className="font-body text-[9px] text-slate-400 uppercase tracking-widest mb-1.5 mt-2">Famille</div>
        <div className="flex gap-1.5 flex-wrap">
          {familyTabs.map(({ id, label }) => {
            const badge = id === "paiements" ? payments.length : 0;
            return (
              <button key={id} onClick={() => setTab(id)}
                className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all flex items-center gap-1 ${tab === id ? "bg-slate-700 text-white font-semibold" : "text-slate-500 bg-sand hover:bg-gray-200"}`}>
                {label}
                {badge > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20" : "bg-gray-200"}`}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Onglet enfant ── */}
      {currentChild && (() => {
        const child = currentChild;
        const childRes = reservations.filter((r: any) => r.childId === child.id);
        const upcoming = childRes.filter((r: any) => r.date >= today && r.status !== "cancelled").sort((a: any, b: any) => a.date.localeCompare(b.date));
        const past = childRes.filter((r: any) => r.date < today).sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 5);
        const bd = child.birthDate?.toDate ? child.birthDate.toDate() : child.birthDate ? new Date(child.birthDate) : null;
        const age = bd && !isNaN(bd.getTime()) ? Math.floor((Date.now() - bd.getTime()) / 31557600000) : null;

        return (
          <div className="flex flex-col gap-5">
            {/* En-tête */}
            <div className="flex items-center gap-3 pb-3 border-b border-blue-500/8">
              <div className="relative shrink-0">
                {child.photoUrl ? (
                  /* Photo présente : clic = agrandir (lightbox) */
                  <button onClick={() => setPhotoLightbox(child.id)} title="Agrandir la photo"
                    className="w-12 h-12 rounded-xl overflow-hidden border-none p-0 cursor-zoom-in bg-blue-50 block">
                    <img src={child.photoUrl} alt={child.firstName} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  /* Pas de photo : clic = choisir/prendre */
                  <label className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-xl cursor-pointer" title="Ajouter une photo">
                    {photoUploading === child.id ? "⏳" : "🧒"}
                    <input type="file" accept="image/*" className="hidden" disabled={photoUploading === child.id}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(child, f); e.target.value = ""; }} />
                  </label>
                )}
                {/* Badge 📷 toujours présent pour changer la photo sans passer par la lightbox */}
                <label className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-[10px] cursor-pointer hover:bg-gray-50" title="Changer la photo">
                  {photoUploading === child.id ? "⏳" : "📷"}
                  <input type="file" accept="image/*" className="hidden" disabled={photoUploading === child.id}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(child, f); e.target.value = ""; }} />
                </label>
              </div>

              {/* Lightbox photo cavalier */}
              {photoLightbox === child.id && child.photoUrl && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPhotoLightbox(null)}>
                  <div className="bg-white rounded-2xl p-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
                    <img src={child.photoUrl} alt={child.firstName} className="w-full rounded-xl object-cover aspect-square" />
                    <div className="font-body text-sm font-semibold text-blue-800 text-center mt-3">{child.firstName}{child.lastName ? ` ${child.lastName}` : ""}</div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {/* capture → ouvre directement l'appareil photo sur mobile (ignoré sur PC) */}
                      <label className="flex-1 text-center font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-lg cursor-pointer">
                        📷 Prendre une photo
                        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={photoUploading === child.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) { uploadPhoto(child, f); setPhotoLightbox(null); } e.target.value = ""; }} />
                      </label>
                      <label className="flex-1 text-center font-body text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg cursor-pointer">
                        🖼 Choisir une image
                        <input type="file" accept="image/*" className="hidden" disabled={photoUploading === child.id}
                          onChange={e => { const f = e.target.files?.[0]; if (f) { uploadPhoto(child, f); setPhotoLightbox(null); } e.target.value = ""; }} />
                      </label>
                      <button onClick={() => setPhotoLightbox(null)}
                        className="font-body text-xs text-slate-500 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer">Fermer</button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1">
                <div className="font-body text-base font-semibold text-blue-800">{child.firstName}{child.lastName ? ` ${child.lastName}` : ""}</div>
                <div className="font-body text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  {bd && !isNaN(bd.getTime()) && <span>Né(e) le {bd.toLocaleDateString("fr-FR")}</span>}
                  {age !== null && age >= 0 && <span className="text-blue-500 font-semibold">{age} ans</span>}
                  {(() => {
                    // ── Assiduité saison : présences sur les séances clôturées ──
                    // allCreneaux est déjà en mémoire (chargé par la page) : zéro
                    // requête. On ne compte que les séances passées où la présence
                    // a été pointée (séance clôturée au montoir).
                    const now = new Date();
                    const sy = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
                    const seasonStart = `${sy}-09-01`;
                    const today = now.toISOString().split("T")[0];
                    const pointees = allCreneaux.filter((c: any) =>
                      c.date >= seasonStart && c.date <= today &&
                      (c.enrolled || []).some((e: any) => e.childId === child.id && e.presence)
                    );
                    if (pointees.length === 0) return null;
                    const absences = pointees.filter((c: any) =>
                      (c.enrolled || []).find((e: any) => e.childId === child.id)?.presence?.startsWith("absent"));
                    const present = pointees.length - absences.length;
                    const ratio = present / pointees.length;
                    const detail = absences.map((c: any) =>
                      `${new Date(c.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${c.activityTitle}`).join("\n");
                    return (
                      <span title={absences.length ? `Absences :\n${detail}` : "Aucune absence cette saison"}
                        className={`font-semibold cursor-help ${ratio < 0.7 ? "text-orange-500" : "text-green-600"}`}>
                        📊 {present}/{pointees.length} présences
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(() => {
                  const d = daysToNextBirthday(child.birthDate);
                  if (d === null || d > 7) return null;
                  return (
                    <span className="font-body text-[10px] font-semibold text-pink-600 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded-full"
                      title={d === 0 ? "C'est son anniversaire aujourd'hui !" : `Anniversaire dans ${d} jour${d > 1 ? "s" : ""}`}>
                      🎂 {d === 0 ? "Aujourd'hui !" : `J-${d}`}
                    </span>
                  );
                })()}
                <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>{child.galopLevel && child.galopLevel !== "—" ? child.galopLevel : "Débutant"}</Badge>
                {/* Manquants = orange compact (à compléter, pas une alerte) ;
                    le rouge reste réservé au bloquant (impayés). */}
                {(!child.firstName?.trim() || !child.lastName?.trim() || !bd || isNaN(bd.getTime())) && (
                  <Badge color="orange">⚠ Profil</Badge>
                )}
                {child.sanitaryForm ? <Badge color="green">Attestation ✓</Badge> : <>
                  <Badge color="orange">⚠ Attestation</Badge>
                  <button onClick={() => relancerAttestation(child)}
                    disabled={relanceSending === child.id || relanceSent[child.id] || !family.parentEmail}
                    title={family.parentEmail ? `Envoyer un email de relance à ${family.parentEmail}` : "Pas d'email renseigné"}
                    className="font-body text-[10px] font-semibold text-orange-700 bg-white border border-orange-300 px-2 py-0.5 rounded-full cursor-pointer hover:bg-orange-50 disabled:opacity-50 disabled:cursor-default">
                    {relanceSent[child.id] ? "✅ Relancé" : relanceSending === child.id ? "Envoi…" : "✉️ Relancer"}
                  </button>
                </>}
                {child.licenceNumber && (
                  <Badge color={child.licencePayee ? "green" : "gray"}>Licence {child.licenceNumber}{child.licencePayee ? "" : " (non payée)"}</Badge>
                )}
              </div>
            </div>
            {/* Actions */}
            {/* Hiérarchie : Inscrire = primaire plein ; consultation = secondaires
                neutres ; actions rares ou destructives = menu ⋯ */}
            <div className="relative flex items-center gap-1.5 flex-wrap -mt-2 pb-3 border-b border-blue-500/8">
              {onInscribe && <button onClick={() => onInscribe(child.id, child.firstName)} className="font-body text-[11px] font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 flex items-center gap-1"><CalendarDays size={11}/> Inscrire</button>}
              <a href={`/admin/progression/${child.id}?familyId=${family.id}`} className="font-body text-[11px] text-slate-600 bg-gray-100 px-2.5 py-1.5 rounded-lg no-underline cursor-pointer hover:bg-gray-200">📈 Progression</a>
              {onBilanPdf && <button onClick={() => onBilanPdf(child)} className="font-body text-[11px] text-slate-600 bg-gray-100 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">🖨 Bilan PDF</button>}
              {onEditSanitary && <button onClick={() => onEditSanitary(child)} className="font-body text-[11px] text-slate-600 bg-gray-100 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">🩺 Fiche sanitaire</button>}
              <button onClick={() => setActionMenuOpen(actionMenuOpen === child.id ? null : child.id)}
                title="Plus d'actions"
                className="font-body text-[13px] font-bold text-slate-500 bg-gray-100 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-gray-200">⋯</button>
              {actionMenuOpen === child.id && (
                <div className="absolute right-0 top-9 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[170px]">
                  {onEditChild && <button onClick={() => { setActionMenuOpen(null); onEditChild(child); }} className="w-full text-left font-body text-xs text-slate-700 px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-gray-50">✏️ Modifier la fiche</button>}
                  {onEditGalop && <button onClick={() => { setActionMenuOpen(null); onEditGalop(child.id); }} className="w-full text-left font-body text-xs text-slate-700 px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-gray-50">🎖 Changer le niveau</button>}
                  {onMoveChild && <button onClick={() => { setActionMenuOpen(null); onMoveChild(child); }} className="w-full text-left font-body text-xs text-slate-700 px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-gray-50 border-t border-gray-100">🔀 Déplacer vers une autre famille</button>}
                  {onDeleteChild && <button onClick={() => { setActionMenuOpen(null); onDeleteChild(child.id, child.firstName); }} className="w-full text-left font-body text-xs text-red-500 px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-red-50 border-t border-gray-100">🗑 Supprimer le cavalier</button>}
                </div>
              )}
            </div>

            {/* Fiche sanitaire — repliée en une ligne par défaut */}
            {child.sanitaryForm && (
              <button onClick={() => setSanitaryExpanded(sanitaryExpanded === child.id ? null : child.id)}
                className="w-full text-left bg-green-50 hover:bg-green-100 rounded-xl px-4 py-2.5 border-none cursor-pointer transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-[10px] text-green-600 uppercase tracking-wider font-semibold">🩺 Fiche sanitaire ✓{!sanitaryExpanded && child.sanitaryForm.allergies ? <span className="ml-2 normal-case tracking-normal font-normal text-orange-600">Allergies : {child.sanitaryForm.allergies}</span> : null}</span>
                  <span className="font-body text-[10px] text-green-500">{sanitaryExpanded === child.id ? "▲" : "▼"}</span>
                </div>
                {sanitaryExpanded === child.id && (
                  <div className="font-body text-xs text-slate-600 flex flex-wrap gap-3 mt-1.5">
                    <span>Allergies : {child.sanitaryForm.allergies || "Aucune"}</span>
                    <span className="text-slate-400">Urgence : {child.sanitaryForm.emergencyContactName} ({child.sanitaryForm.emergencyContactPhone})</span>
                  </div>
                )}
              </button>
            )}

            {/* Thèmes déjà vus (séances passées où l'enfant était inscrit avec un thème) */}
            {(() => {
              const themesVus = Array.from(new Set(
                allCreneaux
                  .filter((c: any) => c.themeStage && (c.enrolled || []).some((e: any) => e.childId === child.id))
                  .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""))
                  .map((c: any) => String(c.themeStage).trim())
                  .filter(Boolean)
              ));
              if (themesVus.length === 0) return null;
              return (
                <div className="mb-3">
                  <div className="font-body text-[10px] text-teal-600 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">🎯 Thèmes déjà vus ({themesVus.length})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {themesVus.map((t: string) => (
                      <span key={t} className="font-body text-[11px] text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2.5 py-1">{t}</span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Prochaines séances */}
            <div>
              <div className="font-body text-[10px] text-green-600 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1"><CalendarDays size={12} /> Prochaines séances ({upcoming.length})</div>
              {upcoming.length === 0 ? <p className="font-body text-xs text-slate-400 italic">Aucune séance à venir.</p> : (
                <div className="flex flex-col gap-1">
                  {(seancesExpanded === child.id ? upcoming : upcoming.slice(0, 3)).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between font-body text-xs py-1.5 px-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-green-700 font-semibold min-w-[80px]">{new Date(r.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
                        <span className="text-slate-500">{r.startTime}–{r.endTime}</span>
                        <span className="text-blue-800 font-semibold">{r.activityTitle}</span>
                      </div>
                      <button title="Annuler" onClick={async () => {
                        if (!confirm(`Annuler ${child.firstName} le ${new Date(r.date + "T12:00:00").toLocaleDateString("fr-FR")} ?`)) return;
                        await updateDoc(doc(db, "reservations", r.id), { status: "cancelled", cancelledAt: new Date().toISOString() });
                        if (r.creneauId) { const cs = await getDoc(doc(db, "creneaux", r.creneauId)); if (cs.exists()) { const enrolled = (cs.data().enrolled || []).filter((e: any) => !(e.childId === r.childId && e.familyId === r.familyId)); await updateDoc(doc(db, "creneaux", r.creneauId), { enrolled, enrolledCount: enrolled.length }); } }
                        fetchFamilies();
                      }} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"><Trash2 size={11} /></button>
                    </div>
                  ))}
                  {upcoming.length > 3 && (
                    <button
                      onClick={() => setSeancesExpanded(seancesExpanded === child.id ? null : child.id)}
                      className="font-body text-[10px] text-blue-500 hover:text-blue-700 text-center bg-transparent border-none cursor-pointer py-1"
                    >
                      {seancesExpanded === child.id ? "▲ Voir moins" : `▼ Voir les ${upcoming.length - 3} autres`}
                    </button>
                  )}
                </div>
              )}
              {past.length > 0 && (
                <div className="mt-2">
                  <button onClick={() => setPastExpanded(pastExpanded === child.id ? null : child.id)}
                    className="font-body text-[10px] text-slate-400 font-semibold mb-1 bg-transparent border-none cursor-pointer p-0 hover:text-slate-600">
                    {pastExpanded === child.id ? "▼" : "▶"} Passées ({past.length})
                  </button>
                  {pastExpanded === child.id && past.map((r: any) => {
                    // Croiser avec les notes de clôture Montoir pour retrouver le poney
                    // attribué à cette séance (même créneau). Les notes "type: seance"
                    // sont créées à la clôture et contiennent creneauId + horseName.
                    const seanceNote = (child.peda?.notes || []).find(
                      (n: any) => n.type === "seance" && n.creneauId === r.creneauId && n.horseName
                    );
                    return (
                      <div key={r.id} className="flex items-center gap-2 font-body text-xs py-1 px-3 text-slate-500">
                        <span className="min-w-[70px]">{new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        <span className="flex-1 truncate">{r.activityTitle}</span>
                        {seanceNote?.horseName && (
                          <span className="font-body text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0" title="Poney attribué lors de la clôture Montoir">
                            🐴 {seanceNote.horseName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Progression FFE — accordéon replié par défaut (bloc volumineux) */}
            <div>
              <button
                onClick={() => setProgressionExpanded(progressionExpanded === child.id ? null : child.id)}
                className="w-full flex items-center justify-between gap-2 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-2 border-none cursor-pointer transition-colors"
              >
                <span className="font-body text-[10px] text-purple-600 font-semibold uppercase tracking-wider flex items-center gap-1">
                  📈 Progression FFE
                  <span className="text-purple-400 normal-case font-normal tracking-normal">· {child.galopLevel && child.galopLevel !== "—" ? child.galopLevel : "Débutant"}</span>
                  {progressionStats[child.id] && (
                    <span className="text-blue-500 normal-case font-bold tracking-normal">· {progressionStats[child.id].pctFFE}% validé FFE</span>
                  )}
                </span>
                <ChevronDown size={14} className={`text-purple-500 transition-transform ${progressionExpanded === child.id ? "rotate-180" : ""}`} />
              </button>
              {progressionExpanded === child.id && (
                <div className="mt-2">
                  <ProgressionEditor childId={child.id} familyId={fid} childName={child.firstName} galopLevel={child.galopLevel}
                    onStats={(s) => setProgressionStats(prev => prev[child.id]?.pctFFE === s.pctFFE ? prev : { ...prev, [child.id]: { pctFFE: s.pctFFE } })} />
                </div>
              )}
            </div>

            {/* Suivi pédagogique */}
            <PedaSuiviCard child={child} familyId={fid} onRefresh={fetchFamilies} />
          </div>
        );
      })()}

      {/* ── Paiements ── */}
      {tab === "paiements" && (
        <div>
          {payments.length === 0 ? <p className="font-body text-xs text-slate-400 italic">Aucun paiement enregistré.</p> : (
            <div className="flex flex-col gap-1">
              {payments.slice(0, 10).map((p: any) => {
                const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                return (
                  <div key={p.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-slate-500 min-w-[65px] flex-shrink-0">{d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}</span>
                      <span className="text-blue-800 font-semibold truncate">{(p.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement"}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                      <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "red"}>{p.status === "paid" ? "Réglé" : p.status === "partial" ? "Partiel" : "À régler"}</Badge>
                      <button onClick={async e => {
                        e.stopPropagation();
                        const invDate = d || new Date();
                        const civilite = family?.civilite ? `${family.civilite} ` : "";
                        const adresseLines = [family?.address, [family?.zipCode, family?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                        const invoiceNumber = p.orderId || `F-${invDate.getFullYear()}${String(invDate.getMonth()+1).padStart(2,"0")}-${(p.id||"").slice(-4).toUpperCase()}`;
                        const items = (p.items||[]).map((i: any) => ({ label: i.activityTitle||"Prestation", priceHT: i.priceHT||Math.round((i.priceTTC||0)/1.055*100)/100, tva: i.tva||5.5, priceTTC: i.priceTTC||0 }));
                        const totalHT = items.reduce((s: number, i: any) => s+(i.priceHT||0), 0);

                        // Charger le détail des encaissements pour cette commande,
                        // afin d'afficher chaque ligne sur la facture au lieu de "mixte"
                        let paymentDetails: any[] = [];
                        try {
                          const encSnap = await getDocs(query(
                            collection(db, "encaissements"),
                            where("paymentId", "==", p.id)
                          ));
                          paymentDetails = encSnap.docs
                            .map(d => d.data() as any)
                            .filter(e => (e.montant || 0) > 0)
                            .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0))
                            .map(e => ({
                              mode: e.mode,
                              modeLabel: modeLabels[e.mode] || e.modeLabel || e.mode,
                              montant: Number(e.montant || 0),
                              date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : undefined,
                              ref: e.ref,
                            }));
                        } catch { /* silencieux : fallback sur paymentMode */ }

                        await downloadInvoicePdf({
                          invoiceNumber, date: invDate.toLocaleDateString("fr-FR"),
                          familyName: `${civilite}${family.parentName||p.familyName}`,
                          familyEmail: family.parentEmail||"", familyAddress: adresseLines,
                          items, totalHT, totalTVA: (p.totalTTC||0)-totalHT, totalTTC: p.totalTTC||0,
                          paidAmount: p.paidAmount||p.totalTTC||0,
                          paymentMode: modeLabels[p.paymentMode]||p.paymentMode||"",
                          paymentDate: p.status==="paid" ? invDate.toLocaleDateString("fr-FR") : "",
                          paymentId: p.id,
                          paymentDetails: paymentDetails.length > 0 ? paymentDetails : undefined,
                        });
                      }} className="text-blue-500 bg-blue-50 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-blue-100 text-[10px]">📄</button>
                    </div>
                  </div>
                );
              })}
              {payments.length > 10 && <p className="font-body text-[10px] text-slate-400 text-center mt-1">+{payments.length-10} autres</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Divers ── */}
      {tab === "divers" && (
        <div className="flex flex-col gap-4">
          {(family.linkedChildren || []).length > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><UserPlus size={10} /> Cavaliers liés</div>
              {(family.linkedChildren || []).map((lc: any) => (
                <div key={lc.childId} className="flex items-center justify-between px-3 py-2 bg-teal-50 rounded-lg border border-teal-100 mb-1">
                  <div><span className="font-body text-sm font-semibold text-teal-800">{lc.childName}</span><div className="font-body text-[10px] text-teal-600">{lc.sourceFamilyName}</div></div>
                  <button onClick={async () => { if (!confirm(`Retirer ${lc.childName} ?`)) return; const newLinked = (family.linkedChildren || []).filter((c: any) => c.childId !== lc.childId); await updateDoc(doc(db, "families", fid), { linkedChildren: newLinked }); fetchFamilies(); }} className="text-red-400 bg-transparent border-none cursor-pointer"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Wallet size={10} /> Avoirs & avances ({avoirs.length})</div>
            {avoirs.length === 0 ? <p className="font-body text-xs text-slate-400 italic">Aucun avoir.</p> : avoirs.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg mb-1">
                <div className="flex items-center gap-2"><Badge color={a.status === "actif" ? "green" : "gray"}>{a.status}</Badge><span className="text-blue-800">{a.reference}</span><span className="text-slate-400">{a.reason}</span></div>
                <span className={`font-semibold ${a.remainingAmount > 0 ? "text-blue-500" : "text-slate-300"}`}>{(a.remainingAmount||0).toFixed(2)}€</span>
              </div>
            ))}
          </div>
          {famCartes.length > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">🎟️ Cartes ({famCartes.length})</div>
              {famCartes.map((c: any) => { const expired = c.dateFin && new Date(c.dateFin) < new Date(); return (
                <div key={c.id} className="flex items-center justify-between font-body text-xs py-2 px-3 bg-sand rounded-lg mb-1">
                  <div className="flex items-center gap-2"><Badge color={c.status === "active" && !expired ? "green" : "gray"}>{c.status === "active" && !expired ? "Active" : "Expirée"}</Badge><span className="text-blue-800">{c.activityType}</span></div>
                  <span className="font-semibold text-blue-500">{c.remainingSessions||0}/{c.totalSessions||0}</span>
                </div>
              ); })}
            </div>
          )}
          <div>
            <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>🏦 Mandat SEPA</span>
              <div className="flex items-center gap-3">
                <button onClick={downloadMandatePdf} disabled={mandatPdfLoading} className="font-body text-[10px] text-slate-500 hover:text-blue-600 bg-transparent border-none cursor-pointer flex items-center gap-1 disabled:opacity-50" title="Télécharger l'autorisation de prélèvement pré-remplie (à imprimer / faire signer)">
                  {mandatPdfLoading ? <Loader2 size={10} className="animate-spin" /> : <span>📄</span>} Autorisation pré-remplie
                </button>
                {!editingMandat && <button onClick={() => { setMandatForm({ iban: mandat?.iban || "", bic: mandat?.bic || "", titulaire: mandat?.titulaire || family.parentName || "", dateSignature: mandat?.dateSignature || new Date().toISOString().split("T")[0], address: family.address || "", zipCode: family.zipCode || "", city: family.city || "" }); setEditingMandat(true); }} className="font-body text-[10px] text-blue-500 bg-transparent border-none cursor-pointer flex items-center gap-1"><Plus size={10} /> {mandat ? "Modifier" : "Ajouter"}</button>}
              </div>
            </div>
            {editingMandat ? (
              <div className="bg-blue-50 rounded-lg p-3 flex flex-col gap-2">
                <input placeholder="IBAN *" value={mandatForm.iban} onChange={e => setMandatForm({ ...mandatForm, iban: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-xs font-mono focus:outline-none focus:border-blue-500 bg-white" />
                <div className="flex gap-2">
                  <input placeholder="BIC" value={mandatForm.bic} onChange={e => setMandatForm({ ...mandatForm, bic: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                  <input placeholder="Titulaire *" value={mandatForm.titulaire} onChange={e => setMandatForm({ ...mandatForm, titulaire: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                </div>
                <input type="date" value={mandatForm.dateSignature} onChange={e => setMandatForm({ ...mandatForm, dateSignature: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                <input placeholder="Adresse (n° et rue)" value={mandatForm.address} onChange={e => setMandatForm({ ...mandatForm, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                <div className="flex gap-2">
                  <input placeholder="Code postal" value={mandatForm.zipCode} onChange={e => setMandatForm({ ...mandatForm, zipCode: e.target.value })} className="w-28 px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                  <input placeholder="Ville" value={mandatForm.city} onChange={e => setMandatForm({ ...mandatForm, city: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-xs focus:outline-none focus:border-blue-500 bg-white" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveMandat} disabled={mandatSaving || !mandatForm.iban || !mandatForm.titulaire} className="flex items-center gap-1 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">{mandatSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer</button>
                  <button onClick={() => setEditingMandat(false)} className="font-body text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                </div>
              </div>
            ) : mandat ? (
              <div className="font-body text-xs py-2 px-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-1"><Badge color="green">Actif</Badge><span className="text-blue-800 font-semibold">{mandat.mandatId}</span></div>
                <div className="text-slate-500">IBAN : {mandat.iban?.slice(0,4)}...{mandat.iban?.slice(-4)}</div>
                <div className="text-slate-500">Titulaire : {mandat.titulaire}</div>
                {/* Photo de l'autorisation de prélèvement signée */}
                {(() => {
                  const scanUrl = scanOverride !== undefined ? scanOverride : (mandat.scanUrl || null);
                  const uploadInput = (
                    <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        setScanUploading(true);
                        try {
                          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                          const storageRef = ref(storage, `mandats-sepa/${fid}/${Date.now()}_${safe}`);
                          const task = uploadBytesResumable(storageRef, file);
                          await new Promise((res, rej) => task.on("state_changed", null, rej, () => res(null)));
                          const url = await getDownloadURL(task.snapshot.ref);
                          await updateDoc(doc(db, "mandats-sepa", mandat.id), { scanUrl: url, scanUploadedAt: serverTimestamp() });
                          setScanOverride(url);
                          fetchFamilies();
                        } catch (err) { console.error(err); alert("Échec de l'envoi de la photo."); }
                        finally { setScanUploading(false); e.target.value = ""; }
                      }} />
                  );
                  return (
                    <div className="mt-2 pt-2 border-t border-blue-100 flex items-center gap-2 flex-wrap">
                      {scanUrl ? (
                        <>
                          <a href={scanUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 font-body text-[11px] font-semibold text-blue-600 hover:text-blue-800 no-underline">
                            <Eye size={12} /> Voir l'autorisation signée
                          </a>
                          <label className="flex items-center gap-1 font-body text-[11px] text-slate-400 hover:text-blue-500 cursor-pointer">
                            {scanUploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />} Remplacer
                            {uploadInput}
                          </label>
                          <button onClick={async () => {
                            if (!confirm("Retirer la photo de l'autorisation ?")) return;
                            await updateDoc(doc(db, "mandats-sepa", mandat.id), { scanUrl: "", updatedAt: serverTimestamp() });
                            setScanOverride(null); fetchFamilies();
                          }} className="flex items-center gap-1 font-body text-[11px] text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0">
                            <Trash2 size={11} /> Retirer
                          </button>
                        </>
                      ) : (
                        <label className="flex items-center gap-1.5 font-body text-[11px] font-semibold text-blue-600 bg-white border border-blue-200 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50">
                          {scanUploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Prendre en photo / joindre l'autorisation
                          {uploadInput}
                        </label>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : <p className="font-body text-xs text-slate-400 italic">Aucun mandat SEPA. Ajoutez le mandat (IBAN) pour pouvoir y joindre la photo de l'autorisation signée.</p>}
          </div>
          {fidData && (fidData.points || 0) > 0 && (
            <div>
              <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">⭐ Fidélité</div>
              <div className="flex items-center gap-3 py-2 px-3 bg-gold-50 rounded-lg border border-gold-200">
                <span className="font-display text-xl font-bold text-gold-600">{fidData.points}</span>
                <span className="font-body text-xs text-gold-600">points ≈ {(fidData.points/100).toFixed(2)}€</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Notes ── */}
      {tab === "notes" && (
        <div>
          <textarea defaultValue={family.notes || ""} onBlur={async e => { if (e.target.value !== (family.notes || "")) { await updateDoc(doc(db, "families", fid), { notes: e.target.value, updatedAt: serverTimestamp() }); fetchFamilies(); } }}
            placeholder="Notes visibles uniquement par l'admin..."
            className="w-full font-body text-xs border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 min-h-[80px] resize-y" />
          <p className="font-body text-[10px] text-slate-400 mt-1">Sauvegarde automatique quand vous cliquez en dehors.</p>
        </div>
      )}
    </div>
  );
}
