"use client";
import { useRef, useState } from "react";
import { Loader2, Mail, X, Paperclip, FileSignature, Mic, Square, Sparkles, Undo2 } from "lucide-react";
import { extensionAudio } from "@/lib/transcription-params";
import { ajouterDictee, consigneMiseEnFormeEmail, lireMiseEnForme } from "@/lib/email-dicte-ia";
import { emailTemplates } from "@/lib/email-templates";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";
import type { DestinataireFiche } from "@/lib/services-etablissement";

interface Props {
  emailModal: { familyId: string; familyName: string; email: string };
  allPayments: any[];
  onClose: () => void;
  /**
   * Adresses proposées (structure + services d'un établissement, cf.
   * destinatairesFiche). Sans elles, seule l'adresse de la fiche.
   */
  destinataires?: DestinataireFiche[];
}

// Au-delà, la requête dépasse ce que le serveur accepte (pièces jointes
// encodées : un tiers de plus que les fichiers).
const TAILLE_MAX_PJ = 3 * 1024 * 1024;

export default function EmailModal({ emailModal, allPayments, onClose, destinataires }: Props) {
  // Plusieurs adresses possibles pour un établissement : la structure et
  // chacun de ses services. Un email par destinataire coché.
  const choix: DestinataireFiche[] = destinataires && destinataires.length > 0
    ? destinataires
    : [{ cle: "principal", libelle: emailModal.familyName, email: emailModal.email }];
  const [coches, setCoches] = useState<Set<string>>(() => new Set([choix[0]?.email].filter(Boolean) as string[]));
  const [emailTemplate, setEmailTemplate] = useState("libre");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  // Pièces jointes : { filename, content (base64 sans préfixe) }
  const [attachments, setAttachments] = useState<{ filename: string; content: string; taille?: number }[]>([]);
  const [attaching, setAttaching] = useState(false);
  const { toast } = useToast();
  // Dictée (micro → /api/whisper) et mise en forme par l'IA (cf. email-dicte-ia).
  const [enregistrement, setEnregistrement] = useState(false);
  const [transcription, setTranscription] = useState(false);
  const [miseEnForme, setMiseEnForme] = useState(false);
  const [remarquesIa, setRemarquesIa] = useState<string[]>([]);
  const [avantIa, setAvantIa] = useState<{ objet: string; message: string } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const corpsRef = useRef("");
  corpsRef.current = emailBody;

  const demarrerDictee = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const morceaux: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) morceaux.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        // Type réellement produit par le navigateur (audio/mp4 sur iPhone).
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(morceaux, { type });
        if (blob.size < 1000) { toast("Enregistrement vide : vérifiez l'autorisation du micro, puis parlez avant d'arrêter.", "warning", 6000); return; }
        setTranscription(true);
        try {
          const fd = new FormData(); fd.append("audio", new File([blob], `email.${extensionAudio(type)}`, { type }));
          const res = await authFetch("/api/whisper", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({ error: res.status === 413 ? "Dictée trop longue : faites-la en plusieurs fois." : `réponse inattendue du serveur (${res.status})` }));
          if (data.success) setEmailBody(ajouterDictee(corpsRef.current, data.text || ""));
          else toast(data.error || "Transcription impossible.", "error", 6000);
        } catch (e: any) { toast("Erreur de transcription : " + (e?.message || ""), "error"); }
        setTranscription(false);
      };
      recorderRef.current = rec;
      rec.start();
      setEnregistrement(true);
    } catch (e: any) { toast("Micro indisponible : " + (e?.message || ""), "error", 6000); }
  };
  const arreterDictee = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setEnregistrement(false);
  };

  const mettreEnForme = async () => {
    if (!emailBody.trim()) return;
    setMiseEnForme(true);
    try {
      const enCours = allPayments.filter((p: any) => p.familyId === emailModal.familyId && p.status !== "cancelled" && p.status !== "paid");
      const resteDu = enCours.reduce((s: number, p: any) => s + Math.max(0, (p.totalTTC || 0) - (p.paidAmount || 0)), 0);
      const prestations = enCours.flatMap((p: any) => (p.items || []).map((i: any) => i.activityTitle)).filter(Boolean).slice(0, 8).join(", ");
      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "texte_libre", prompt: consigneMiseEnFormeEmail(emailBody, emailSubject, { nomFamille: emailModal.familyName, resteDu, prestations }) }),
      });
      const data = await res.json().catch(() => ({}));
      const lu = lireMiseEnForme(data.text || "");
      if (!res.ok || !lu) { toast(data.error || "L'IA n'a pas renvoyé de message exploitable. Votre texte est inchangé.", "error", 6000); return; }
      setAvantIa({ objet: emailSubject, message: emailBody });
      setEmailBody(lu.message);
      if (lu.objet) setEmailSubject(lu.objet);
      setRemarquesIa(lu.remarques);
    } catch { toast("Erreur IA. Votre texte est inchangé.", "error"); }
    finally { setMiseEnForme(false); }
  };
  const annulerMiseEnForme = () => {
    if (!avantIa) return;
    setEmailSubject(avantIa.objet); setEmailBody(avantIa.message);
    setAvantIa(null); setRemarquesIa([]);
  };

  // Lit un Blob/File en base64 (sans le préfixe data:...;base64,)
  const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const handleAddFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: { filename: string; content: string; taille?: number }[] = [];
    for (const file of Array.from(files)) {
      try { added.push({ filename: file.name, content: await toBase64(file), taille: file.size }); }
      catch { toast(`Impossible de lire ${file.name}`, "error"); }
    }
    setAttachments(prev => [...prev, ...added]);
  };

  const handleAttachMandate = async () => {
    setAttaching(true);
    try {
      const res = await authFetch("/api/admin/sepa-mandate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: emailModal.familyId }),
      });
      if (!res.ok) { toast("Échec de la génération de l'autorisation", "error"); return; }
      const blob = await res.blob();
      const content = await toBase64(blob);
      const safe = (emailModal.familyName || "famille").replace(/[^a-zA-Z0-9._-]/g, "_");
      setAttachments(prev => [...prev, { filename: `autorisation-prelevement-${safe}.pdf`, content }]);
      toast("Autorisation de prélèvement jointe", "success");
    } catch { toast("Erreur lors de la génération", "error"); }
    finally { setAttaching(false); }
  };

  const handleTemplateChange = (t: string) => {
    setEmailTemplate(t);
    if (t === "rappelImpaye") {
      const pays = allPayments.filter((p: any) =>
        p.familyId === emailModal.familyId && p.status !== "cancelled" && p.status !== "paid"
      );
      const montant = pays.reduce((s: number, p: any) => s + ((p.totalTTC || 0) - (p.paidAmount || 0)), 0);
      const tpl = emailTemplates.rappelImpaye({
        parentName: emailModal.familyName, montant,
        prestations: pays.map((p: any) => (p.items || []).map((i: any) => i.activityTitle).join(", ")).join("; ") || "Prestations en cours",
      });
      setEmailSubject(tpl.subject); setEmailBody(tpl.html);
    } else if (t === "bienvenue") {
      const tpl = emailTemplates.bienvenueNouvelleFamille({ parentName: emailModal.familyName });
      setEmailSubject(tpl.subject); setEmailBody(tpl.html);
    } else {
      setEmailSubject(""); setEmailBody("");
    }
  };

  const tailleJointe = attachments.reduce((s, a) => s + (a.taille ?? Math.round(a.content.length * 0.75)), 0);
  const tropLourd = tailleJointe > TAILLE_MAX_PJ;
  const destinatairesCoches = choix.filter(d => coches.has(d.email));

  const handleSend = async () => {
    if (!emailSubject.trim() || !emailBody.trim() || destinatairesCoches.length === 0 || tropLourd) return;
    setEmailSending(true);
    const envoyes: string[] = [];
    const echecs: string[] = [];
    try {
      const htmlContent = emailTemplate === "libre"
        ? `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${emailBody.replace(/</g, "&lt;")}</div>`
        : emailBody;
      // Un envoi par destinataire : chaque service reçoit son propre email,
      // sans voir les adresses des autres.
      for (const dest of destinatairesCoches) {
      const res = await authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: dest.email, subject: emailSubject, html: htmlContent,
          context: emailTemplate === "rappelImpaye"
            ? "admin_rappel_impaye"
            : emailTemplate === "bienvenue"
            ? "admin_bienvenue_famille"
            : "admin_manual",
          template: emailTemplate === "rappelImpaye"
            ? "rappelImpaye"
            : emailTemplate === "bienvenue"
            ? "bienvenueNouvelleFamille"
            : undefined,
          familyId: emailModal.familyId,
          ...(attachments.length > 0 ? { attachments } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) echecs.push(`${dest.email} (${data.error || "envoi échoué"})`);
      else envoyes.push(data.testMode ? `${dest.email} → mode test ${data.sentTo}` : dest.email);
      }
      if (echecs.length > 0) {
        toast(`❌ Non envoyé : ${echecs.join(", ")}${envoyes.length ? ` — envoyé : ${envoyes.join(", ")}` : ""}`, "error", 8000);
        // Ne garder cochés que les envois ratés, pour relancer ceux-là seuls.
        setCoches(new Set(destinatairesCoches.filter(d => !envoyes.some(e => e.startsWith(d.email))).map(d => d.email)));
      } else {
        toast(`✅ Email envoyé à ${envoyes.join(", ")}`, "success");
        onClose();
      }
    } catch {
      toast("Erreur lors de l'envoi", "error");
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Envoyer un email</h2>
            <p className="font-body text-xs text-slate-500 mt-0.5">{destinatairesCoches.map(d => d.email).join(", ") || "Aucun destinataire coché"}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
        </div>
        <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {choix.length > 1 && (
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Destinataires</label>
              <div className="flex flex-col gap-1">
                {choix.map(d => (
                  <label key={d.email} className="flex items-center gap-2 font-body text-xs text-slate-700 bg-sand rounded-lg px-3 py-1.5 cursor-pointer">
                    <input type="checkbox" className="accent-blue-600 w-4 h-4" checked={coches.has(d.email)}
                      onChange={e => setCoches(prev => { const n = new Set(prev); e.target.checked ? n.add(d.email) : n.delete(d.email); return n; })} />
                    <span className="min-w-0 truncate"><strong>{d.libelle}</strong> · {d.email}</span>
                  </label>
                ))}
              </div>
              <p className="font-body text-[10px] text-slate-400 mt-1">Un email distinct par destinataire coché : chacun ne voit que sa propre adresse.</p>
            </div>
          )}
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Template</label>
            <select value={emailTemplate} onChange={e => handleTemplateChange(e.target.value)}
              className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400 cursor-pointer">
              <option value="libre">✏️ Message libre</option>
              <option value="rappelImpaye">⚠️ Rappel impayé</option>
              <option value="bienvenue">👋 Bienvenue</option>
            </select>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Objet *</label>
            <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
              placeholder="Ex: Votre inscription au Centre Équestre d'Agon"
              className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"/>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Message *</label>
            <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
              rows={emailTemplate === "libre" ? 6 : 3}
              placeholder={emailTemplate === "libre" ? "Bonjour,\n\nVotre message ici..." : "HTML du template (modifiable)"}
              className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400 resize-none"/>
            {emailTemplate === "libre" && (
              <>
                <div className="flex flex-wrap gap-2 mt-2">
                  {enregistrement ? (
                    <button type="button" onClick={arreterDictee}
                      className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg border-none cursor-pointer animate-pulse">
                      <Square size={13} /> Arrêter la dictée
                    </button>
                  ) : (
                    <button type="button" onClick={demarrerDictee} disabled={transcription || miseEnForme}
                      className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                      {transcription ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />} {transcription ? "Transcription…" : "Dicter"}
                    </button>
                  )}
                  <button type="button" onClick={mettreEnForme} disabled={!emailBody.trim() || enregistrement || transcription || miseEnForme}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    {miseEnForme ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Mettre en forme avec l&apos;IA
                  </button>
                  {avantIa && (
                    <button type="button" onClick={annulerMiseEnForme}
                      className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg border-none cursor-pointer">
                      <Undo2 size={13} /> Revenir à mon texte
                    </button>
                  )}
                </div>
                {remarquesIa.length > 0 && (
                  <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                    <div className="font-body text-[11px] font-semibold text-orange-800 mb-1">À vérifier avant d&apos;envoyer :</div>
                    <ul className="m-0 pl-4 font-body text-[11px] text-orange-900">
                      {remarquesIa.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                <p className="font-body text-[10px] text-slate-400 mt-1">Dictez ou tapez, puis relisez : l&apos;IA met en forme sans rien ajouter. Le message sera envoyé en texte brut.</p>
              </>
            )}
          </div>

          {/* Pièces jointes */}
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1.5">Pièces jointes</label>
            <div className="flex flex-wrap gap-2 mb-2">
              <label className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg cursor-pointer">
                <Paperclip size={13} /> Joindre un fichier
                <input type="file" multiple className="hidden" onChange={e => { handleAddFiles(e.target.files); e.target.value = ""; }} />
              </label>
              <button type="button" onClick={handleAttachMandate} disabled={attaching}
                className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                {attaching ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />} Autorisation de prélèvement (pré-remplie)
              </button>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-col gap-1">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between bg-sand rounded-lg px-3 py-1.5">
                    <span className="font-body text-xs text-slate-600 truncate flex items-center gap-1.5"><Paperclip size={11} /> {a.filename}</span>
                    <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5" title="Retirer">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {tropLourd && (
              <p className="font-body text-[11px] text-red-600 mt-1">
                Pièces jointes trop lourdes ({(tailleJointe / 1024 / 1024).toFixed(1)} Mo, 3 Mo au plus) : retirez un fichier ou envoyez-le en plusieurs fois.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button type="button" onClick={onClose} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button type="button" disabled={!emailSubject.trim() || !emailBody.trim() || emailSending || destinatairesCoches.length === 0 || tropLourd} onClick={handleSend}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-green-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-green-600 disabled:opacity-50">
            {emailSending ? <Loader2 size={14} className="animate-spin"/> : <Mail size={14}/>}
            Envoyer{destinatairesCoches.length > 1 ? ` (${destinatairesCoches.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
