"use client";
import { useState } from "react";
import { Loader2, Mail, X, Paperclip, FileSignature } from "lucide-react";
import { emailTemplates } from "@/lib/email-templates";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";

interface Props {
  emailModal: { familyId: string; familyName: string; email: string };
  allPayments: any[];
  onClose: () => void;
}

export default function EmailModal({ emailModal, allPayments, onClose }: Props) {
  const [emailTemplate, setEmailTemplate] = useState("libre");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  // Pièces jointes : { filename, content (base64 sans préfixe) }
  const [attachments, setAttachments] = useState<{ filename: string; content: string }[]>([]);
  const [attaching, setAttaching] = useState(false);
  const { toast } = useToast();

  // Lit un Blob/File en base64 (sans le préfixe data:...;base64,)
  const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const handleAddFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: { filename: string; content: string }[] = [];
    for (const file of Array.from(files)) {
      try { added.push({ filename: file.name, content: await toBase64(file) }); }
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

  const handleSend = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setEmailSending(true);
    try {
      const htmlContent = emailTemplate === "libre"
        ? `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${emailBody.replace(/</g, "&lt;")}</div>`
        : emailBody;
      const res = await authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailModal.email, subject: emailSubject, html: htmlContent,
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
      const data = await res.json();
      if (!res.ok || data.error) {
        toast(`❌ Erreur : ${data.error || "Envoi échoué"}`, "error");
      } else {
        toast(`✅ Email envoyé${data.testMode ? ` (mode test → ${data.sentTo})` : ` à ${emailModal.email}`}`, "success");
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
            <p className="font-body text-xs text-slate-500 mt-0.5">{emailModal.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
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
              <p className="font-body text-[10px] text-slate-400 mt-1">Le message sera envoyé en texte brut.</p>
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
                    <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5" title="Retirer">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button disabled={!emailSubject.trim() || !emailBody.trim() || emailSending} onClick={handleSend}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-green-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-green-600 disabled:opacity-50">
            {emailSending ? <Loader2 size={14} className="animate-spin"/> : <Mail size={14}/>}
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
