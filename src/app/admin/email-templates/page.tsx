"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { Save, Loader2, Sparkles, Eye, Code, ChevronDown, ChevronUp, RotateCcw, Send, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

// ─── Types ───
interface TemplateConfig {
  subject: string;
  body: string; // HTML body content (inside the wrapper)
  variables: string[]; // Available variables like {childName}, {date}, etc.
  description: string;
  lastModified?: string;
}

// ─── Default templates ───
const DEFAULT_TEMPLATES: Record<string, TemplateConfig> = {
  confirmationStage: {
    subject: "Inscription confirmée — {stageTitle}",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>L'inscription au stage <strong style="color:#1e3a5f;">{stageTitle}</strong> est confirmée !</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0 0 8px;color:#166534;font-weight:600;">📅 {dates}</p>
  <p style="margin:0;color:#166534;font-weight:600;">🕐 {horaires}</p>
  <p style="margin:8px 0 0;color:#555;font-size:13px;">👧 {enfants}</p>
  <p style="margin:8px 0 0;color:#1e3a5f;font-weight:bold;font-size:16px;">{montant}€</p>
</div>
<p style="color:#555;font-size:13px;"><strong>À prévoir :</strong> bottes, bombe, pantalon long. Prévoir un goûter et de l'eau.</p>
<p style="color:#555;font-size:13px;">Rendez-vous 10 minutes avant le début du stage devant le club house.</p>
<p style="color:#555;">À bientôt au centre équestre ! 🐴</p>`,
    variables: ["parentName", "stageTitle", "dates", "horaires", "enfants", "montant"],
    description: "Envoyé après inscription à un stage (Pâques, été, Toussaint...)",
  },
  confirmationCours: {
    subject: "Réservation confirmée — {coursTitle}",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>La réservation de <strong>{childName}</strong> est confirmée :</p>
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#1e40af;font-weight:600;">📚 {coursTitle}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 {date} · 🕐 {horaire}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">👤 Moniteur : {moniteur}</p>
  <p style="margin:6px 0 0;color:#1e3a5f;font-weight:bold;font-size:15px;">{prix}€</p>
</div>
<p style="color:#555;font-size:13px;">N'oubliez pas les bottes et la bombe ! 🐴</p>`,
    variables: ["parentName", "childName", "coursTitle", "date", "horaire", "moniteur", "prix"],
    description: "Envoyé après réservation d'un cours ponctuel",
  },
  confirmationForfait: {
    subject: "Forfait annuel confirmé — {childName}",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Le forfait annuel de <strong>{childName}</strong> est enregistré :</p>
<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#854d0e;font-weight:600;">📋 {forfaitLabel}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">{nbSeances} séances · Paiement {planPaiement}</p>
  <p style="margin:6px 0 0;color:#1e3a5f;font-weight:bold;font-size:16px;">{totalTTC}€</p>
</div>
<p style="color:#555;">À bientôt au centre équestre !</p>`,
    variables: ["parentName", "childName", "forfaitLabel", "nbSeances", "planPaiement", "totalTTC"],
    description: "Envoyé après inscription en forfait annuel",
  },
  confirmationPromenade: {
    subject: "Promenade confirmée — {date}",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Votre réservation de promenade est confirmée !</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#166534;font-weight:600;">🌿 Promenade à cheval</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 {date} · 🕐 {horaire}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">👧 {participants}</p>
  <p style="margin:6px 0 0;color:#1e3a5f;font-weight:bold;font-size:15px;">{prix}€</p>
</div>
<p style="color:#555;font-size:13px;"><strong>Rendez-vous :</strong> au parking du centre équestre, 15 minutes avant le départ.</p>
<p style="color:#555;font-size:13px;"><strong>À prévoir :</strong> pantalon long, chaussures fermées. Bombe fournie si besoin.</p>
<p style="color:#555;">Bonne balade ! 🐴</p>`,
    variables: ["parentName", "date", "horaire", "participants", "prix"],
    description: "Envoyé après réservation d'une promenade/balade",
  },
  rappelJ1: {
    subject: "Rappel — {coursTitle} demain",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Petit rappel : <strong>{childName}</strong> a cours demain !</p>
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#1e40af;font-weight:600;font-size:15px;">📚 {coursTitle}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 {date}</p>
  <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 {horaire}</p>
  <p style="margin:4px 0 0;color:#555;font-size:13px;">👤 {moniteur}</p>
</div>
<p style="color:#555;font-size:13px;">N'oubliez pas les bottes et la bombe ! 🐴</p>`,
    variables: ["parentName", "childName", "coursTitle", "date", "horaire", "moniteur"],
    description: "Envoyé automatiquement la veille d'un cours (cron J-1)",
  },
  rappelImpaye: {
    subject: "Rappel de paiement — {montant}€",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Nous nous permettons de vous rappeler qu'un solde reste dû :</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#991b1b;font-weight:600;font-size:18px;">{montant}€</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">{prestations}</p>
</div>
<p style="color:#555;font-size:13px;">Merci de régulariser votre situation à votre convenance.</p>
<p style="color:#555;font-size:13px;">Vous pouvez régler directement en ligne via votre espace famille.</p>`,
    variables: ["parentName", "montant", "prestations"],
    description: "Envoyé manuellement depuis les Impayés (bouton Relancer)",
  },
  bienvenue: {
    subject: "Bienvenue au Centre Équestre d'Agon-Coutainville !",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Bienvenue au Centre Équestre d'Agon-Coutainville ! 🐴</p>
<p>Votre espace personnel est prêt. Vous pouvez dès maintenant :</p>
<ul style="color:#555;font-size:14px;line-height:1.8;">
  <li>Compléter le profil de votre famille</li>
  <li>Inscrire vos enfants aux activités</li>
  <li>Réserver des stages et des balades</li>
  <li>Suivre vos paiements et factures</li>
</ul>
<p>N'hésitez pas à nous contacter au 02 44 84 99 96 pour toute question.</p>`,
    variables: ["parentName"],
    description: "Envoyé à la création d'un compte famille",
  },
};

const TEMPLATE_LABELS: Record<string, string> = {
  confirmationStage: "✅ Confirmation stage",
  confirmationCours: "✅ Confirmation cours",
  confirmationForfait: "✅ Confirmation forfait annuel",
  confirmationPromenade: "✅ Confirmation promenade",
  rappelJ1: "🔔 Rappel J-1",
  rappelImpaye: "💰 Relance impayé",
  bienvenue: "👋 Bienvenue nouvelle famille",
};

// ─── Email wrapper (same as email-templates.ts) ───
function wrapHtml(content: string) {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;">
    <div style="background:#1e3a5f;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="color:white;margin:0;font-size:18px;font-weight:700;">Centre Équestre d'Agon-Coutainville</h1>
    </div>
    <div style="background:white;padding:24px;border:1px solid #e8e0d0;border-top:none;">
      ${content}
    </div>
    <div style="background:#f8f5f0;padding:16px 24px;border-radius:0 0 12px 12px;border:1px solid #e8e0d0;border-top:none;">
      <p style="margin:0;color:#999;font-size:11px;text-align:center;">
        Centre Équestre d'Agon-Coutainville · 02 44 84 99 96 · ceagon@orange.fr<br/>
        <a href="https://centre-equestre-agon.vercel.app" style="color:#2050A0;text-decoration:none;">Accéder à mon espace</a>
      </p>
    </div>
  </div>`;
}

// ─── Replace variables with sample data for preview ───
function previewReplace(html: string) {
  const samples: Record<string, string> = {
    parentName: "Dupont",
    childName: "Lucas",
    stageTitle: "Stage Bronze & Argent",
    dates: "Du 21 au 25 avril 2026",
    horaires: "10h00 - 12h00",
    enfants: "Lucas, Emma",
    montant: "175.00",
    coursTitle: "Galop d'or",
    date: "Mercredi 2 avril 2026",
    horaire: "10h00–11h00",
    moniteur: "Emmeline",
    prix: "26.00",
    forfaitLabel: "Galop d'or — Mercredi 10:00",
    nbSeances: "13",
    planPaiement: "1×",
    totalTTC: "605.00",
    prestations: "Forfait Galop d'or, Licence FFE -18ans",
    participants: "Lucas, Emma",
  };
  let result = html;
  for (const [key, val] of Object.entries(samples)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), val);
  }
  return result;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Record<string, TemplateConfig>>({});
  const [selectedKey, setSelectedKey] = useState<string>("confirmationStage");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);
  const [sendTestTo, setSendTestTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  // Load from Firestore or use defaults
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "emailTemplates"));
        if (snap.exists()) {
          const saved = snap.data() as Record<string, any>;
          // Merge saved with defaults (in case new templates were added)
          const merged = { ...DEFAULT_TEMPLATES };
          for (const key of Object.keys(merged)) {
            if (saved[key]) merged[key] = { ...merged[key], ...saved[key] };
          }
          setTemplates(merged);
        } else {
          setTemplates(DEFAULT_TEMPLATES);
        }
      } catch { setTemplates(DEFAULT_TEMPLATES); }
      setLoading(false);
    })();
  }, []);

  const current = templates[selectedKey];
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  if (!current) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave = { ...templates };
      // Add lastModified
      toSave[selectedKey] = { ...toSave[selectedKey], lastModified: new Date().toISOString() };
      await setDoc(doc(db, "settings", "emailTemplates"), toSave);
      setTemplates(toSave);
      alert("✅ Templates sauvegardés !");
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
    setSaving(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "generate_email_template",
          templateKey: selectedKey,
          templateLabel: TEMPLATE_LABELS[selectedKey] || selectedKey,
          variables: current.variables,
          currentBody: current.body,
          userPrompt: aiPrompt.trim() || "",
        }),
      });
      const data = await res.json();
      if (data.success && data.generatedBody) {
        setTemplates(prev => ({
          ...prev,
          [selectedKey]: { ...prev[selectedKey], body: data.generatedBody },
        }));
      } else {
        alert("Erreur : " + (data.error || "Réponse vide"));
      }
    } catch (e: any) {
      alert("Erreur IA : " + e.message);
    }
    setGenerating(false);
  };

  const handleSendTest = async () => {
    if (!sendTestTo.includes("@")) { alert("Email invalide"); return; }
    setSendingTest(true);
    try {
      const html = wrapHtml(previewReplace(current.body));
      const subject = previewReplace(current.subject) + " [TEST]";
      const res = await authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: sendTestTo, subject, html, context: "admin_test_template", template: selectedKey }),
      });
      const data = await res.json();
      if (data.success) alert(`✅ Email test envoyé à ${sendTestTo}`);
      else alert(`❌ Erreur : ${data.error}`);
    } catch (e: any) { alert("Erreur : " + e.message); }
    setSendingTest(false);
  };

  const handleReset = () => {
    if (!confirm("Réinitialiser ce template aux valeurs par défaut ?")) return;
    setTemplates(prev => ({
      ...prev,
      [selectedKey]: DEFAULT_TEMPLATES[selectedKey],
    }));
  };

  const TEMPLATE_TRIGGERS: Record<string, string> = {
    confirmationStage: "📤 Envoyé automatiquement quand une inscription à un stage est enregistrée",
    confirmationCours: "📤 Envoyé automatiquement quand une inscription à un cours est enregistrée",
    rappelImpaye: "📤 Envoyé manuellement depuis la fiche famille (bouton 'Rappel impayé')",
    rappelStage: "📤 Envoyé automatiquement J-3 avant le début d'un stage",
    bienvenueNouvelleFamille: "📤 Envoyé automatiquement lors de la création d'une nouvelle famille",
    relanceImpaye: "📤 Envoyé par le cron nocturne aux familles avec impayés > 30 jours",
    confirmationPaiement: "📤 Envoyé automatiquement après encaissement d'un paiement",
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Templates email</h1>
          <p className="font-body text-xs text-slate-500">Personnalisez vos emails automatiques</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-green-600 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Sauvegarder tout
        </button>
      </div>

      {/* Bandeau d'aide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <div className="font-body text-sm font-semibold text-blue-800 mb-1">💡 Comment ça marche ?</div>
        <div className="font-body text-xs text-blue-700 space-y-1">
          <p>1. <strong>Choisissez un template</strong> dans la liste à gauche (ex: "Confirmation d'inscription")</p>
          <p>2. <strong>Modifiez le contenu</strong> en mode HTML, ou demandez à <strong>l'IA de le réécrire</strong> avec vos instructions</p>
          <p>3. <strong>Testez</strong> en vous envoyant un email d'exemple</p>
          <p>4. <strong>Sauvegardez</strong> — l'email sera envoyé automatiquement à chaque événement</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* ── Sidebar : liste des templates ── */}
        <div className="w-full lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {Object.keys(DEFAULT_TEMPLATES).map(key => (
            <button key={key} onClick={() => setSelectedKey(key)}
              className={`text-left px-3 py-2.5 rounded-lg font-body text-xs font-semibold whitespace-nowrap cursor-pointer border-none transition-all flex-shrink-0 ${
                selectedKey === key ? "bg-blue-500 text-white" : "bg-white text-slate-600 hover:bg-blue-50"
              }`}>
              {TEMPLATE_LABELS[key] || key}
            </button>
          ))}
        </div>

        {/* ── Main : éditeur ── */}
        <div className="flex-1 flex flex-col gap-4">
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-body text-base font-bold text-blue-800">{TEMPLATE_LABELS[selectedKey]}</div>
                <div className="font-body text-[10px] text-slate-500 mt-0.5">{current.description}</div>
                {TEMPLATE_TRIGGERS[selectedKey] && (
                  <div className="font-body text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1 mt-1 inline-block">
                    {TEMPLATE_TRIGGERS[selectedKey]}
                  </div>
                )}
              </div>
              <button onClick={handleReset} className="font-body text-[10px] text-slate-400 bg-transparent border-none cursor-pointer hover:text-red-500 flex items-center gap-1">
                <RotateCcw size={10} /> Réinitialiser
              </button>
            </div>

            {/* Variables disponibles */}
            <div className="mb-4">
              <div className="font-body text-[10px] text-slate-500 mb-1">Variables disponibles :</div>
              <div className="flex flex-wrap gap-1">
                {current.variables.map(v => (
                  <span key={v} onClick={() => navigator.clipboard?.writeText(`{${v}}`)}
                    className="font-mono text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-100" title="Cliquer pour copier">
                    {`{${v}}`}
                  </span>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="mb-4">
              <label className="font-body text-xs text-slate-500 block mb-1">Objet de l&apos;email</label>
              <input value={current.subject}
                onChange={e => setTemplates(prev => ({ ...prev, [selectedKey]: { ...prev[selectedKey], subject: e.target.value } }))}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
            </div>

            {/* Toggle preview/code */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => setPreviewMode(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${previewMode ? "bg-blue-500 text-white" : "bg-gray-100 text-slate-600"}`}>
                <Eye size={12} /> Aperçu
              </button>
              <button onClick={() => setPreviewMode(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${!previewMode ? "bg-blue-500 text-white" : "bg-gray-100 text-slate-600"}`}>
                <Code size={12} /> HTML
              </button>
            </div>

            {/* Editor / Preview */}
            {previewMode ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <div className="font-body text-[10px] text-slate-400">Aperçu avec données d&apos;exemple</div>
                  <div className="font-body text-xs text-blue-800 font-semibold">{previewReplace(current.subject)}</div>
                </div>
                <div className="p-4" dangerouslySetInnerHTML={{ __html: wrapHtml(previewReplace(current.body)) }} />
              </div>
            ) : (
              <textarea value={current.body}
                onChange={e => setTemplates(prev => ({ ...prev, [selectedKey]: { ...prev[selectedKey], body: e.target.value } }))}
                rows={20}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-mono text-xs bg-cream focus:border-blue-500 focus:outline-none resize-y" />
            )}
          </Card>

          {/* ── IA Generation ── */}
          <Card padding="md" className="bg-purple-50 border-purple-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-purple-600" />
              <div className="font-body text-sm font-semibold text-purple-800">Générer avec l&apos;IA</div>
            </div>
            <div className="flex gap-2">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                placeholder="Ex: plus chaleureux, ajouter les horaires de rendez-vous, ton plus formel..."
                className="flex-1 px-3 py-2.5 rounded-lg border border-purple-200 font-body text-sm bg-white focus:border-purple-500 focus:outline-none" />
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-purple-600 border-none cursor-pointer hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap">
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Générer
              </button>
            </div>
            <p className="font-body text-[10px] text-purple-500 mt-2">
              L&apos;IA va réécrire le contenu du template. Vous pouvez affiner avec des instructions spécifiques.
              Laissez vide pour une génération automatique adaptée au type d&apos;email.
            </p>
          </Card>

          {/* ── Test email ── */}
          <Card padding="md" className="bg-green-50 border-green-200">
            <div className="flex items-center gap-2 mb-3">
              <Send size={16} className="text-green-600" />
              <div className="font-body text-sm font-semibold text-green-800">Envoyer un email test</div>
            </div>
            <div className="flex gap-2">
              <input value={sendTestTo} onChange={e => setSendTestTo(e.target.value)}
                placeholder="votre@email.com" type="email"
                className="flex-1 px-3 py-2.5 rounded-lg border border-green-200 font-body text-sm bg-white focus:border-green-500 focus:outline-none" />
              <button onClick={handleSendTest} disabled={sendingTest || !sendTestTo}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Envoyer test
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
