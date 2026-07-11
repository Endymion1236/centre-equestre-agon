"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Loader2,
  Mail,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { Family } from "@/types";
import { authFetch } from "@/lib/auth-fetch";
import { db } from "@/lib/firebase";

type CommunicationTab = "newsletter" | "historique";

type SendResult = {
  ok: number;
  fail: number;
};

export default function CommunicationPage() {
  const [tab, setTab] = useState<CommunicationTab>("newsletter");
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAudience, setSelectedAudience] = useState("");
  const [reinscritIds, setReinscritIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<SendResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [famSnap, histSnap, forfaitSnap] = await Promise.all([
        getDocs(collection(db, "families")),
        getDocs(collection(db, "communications")),
        getDocs(collection(db, "forfaits")),
      ]);
      setFamilies(famSnap.docs.map((item) => ({ firestoreId: item.id, ...item.data() })) as any);
      // Familles ayant (re)pris un forfait — le système de forfaits est propre à
      // la saison 2026-2027, donc tout forfait = réinscription en cours.
      setReinscritIds(new Set(forfaitSnap.docs.map((d) => (d.data() as any).familyId).filter(Boolean)));
      setHistory(
        histSnap.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((first: any, second: any) => (second.sentAt?.seconds || 0) - (first.sentAt?.seconds || 0))
      );
    } catch (error) {
      console.error("Erreur chargement communication:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const audiences = useMemo(() => [
    {
      id: "all",
      label: "Toutes les familles",
      description: "Tous les comptes disposant d’une adresse email",
      count: families.filter((family) => family.parentEmail).length,
    },
    {
      id: "with-children",
      label: "Familles avec cavaliers",
      description: "Au moins un enfant enregistré",
      count: families.filter((family) => family.parentEmail && (family.children || []).length > 0).length,
    },
    {
      id: "no-children",
      label: "Profils incomplets",
      description: "Compte créé sans cavalier renseigné",
      count: families.filter((family) => family.parentEmail && (family.children || []).length === 0).length,
    },
    {
      id: "tag-cavalier_annee",
      label: "Cavaliers à l’année",
      description: "Familles portant le segment cavalier annuel",
      count: families.filter((family) => family.parentEmail && (family as any).tags?.includes("cavalier_annee")).length,
    },
    {
      id: "non-reinscrits",
      label: "Cavaliers non réinscrits",
      description: "Cavaliers à l’année sans forfait 2026-2027 enregistré",
      count: families.filter((family) => family.parentEmail && (family as any).tags?.includes("cavalier_annee") && !reinscritIds.has(family.firestoreId)).length,
    },
    {
      id: "tag-stage",
      label: "Familles stages",
      description: "Familles ayant le segment stage",
      count: families.filter((family) => family.parentEmail && (family as any).tags?.includes("stage")).length,
    },
    {
      id: "tag-passage",
      label: "Clients de passage",
      description: "Visiteurs et cavaliers occasionnels",
      count: families.filter((family) => family.parentEmail && (family as any).tags?.includes("passage")).length,
    },
  ], [families, reinscritIds]);

  const getRecipients = () => {
    if (selectedAudience === "all") return families.filter((family) => family.parentEmail);
    if (selectedAudience === "with-children") {
      return families.filter((family) => family.parentEmail && (family.children || []).length > 0);
    }
    if (selectedAudience === "no-children") {
      return families.filter((family) => family.parentEmail && (family.children || []).length === 0);
    }
    if (selectedAudience === "non-reinscrits") {
      return families.filter((family) => family.parentEmail && (family as any).tags?.includes("cavalier_annee") && !reinscritIds.has(family.firestoreId));
    }
    if (selectedAudience.startsWith("tag-")) {
      const tag = selectedAudience.replace("tag-", "");
      return families.filter((family) => family.parentEmail && (family as any).tags?.includes(tag));
    }
    return [];
  };

  const recipients = getRecipients();
  const familiesWithEmail = families.filter((family) => family.parentEmail).length;
  const latestCampaign = history[0];

  const replaceVariables = (text: string, family: any) => text
    .replace(/\[prenom_parent\]/g, family.parentName?.split(" ")[0] || "")
    .replace(/\[nom_famille\]/g, family.parentName || "")
    .replace(/\[prenom_enfant\]/g, (family.children || [])[0]?.firstName || "")
    .replace(/\[nb_enfants\]/g, (family.children || []).length.toString())
    .replace(/\[lien_reservation\]/g, "https://centre-equestre-agon.vercel.app/espace-cavalier/reserver");

  const handleSend = async () => {
    if (recipients.length === 0 || !subject.trim()) return;
    setSending(true);
    let ok = 0;
    let fail = 0;

    for (const family of recipients) {
      try {
        const personalSubject = replaceVariables(subject, family);
        const personalBody = replaceVariables(body, family);
        const response = await authFetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: family.parentEmail,
            subject: personalSubject,
            context: "admin_communication",
            familyId: family.firestoreId,
            html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;">
              <h2 style="color:#1e3a5f;">Centre Equestre d'Agon-Coutainville</h2>
              ${personalBody.split("\n").map((line) => `<p style="color:#333;line-height:1.6;">${line}</p>`).join("")}
              <hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />
              <p style="color:#999;font-size:11px;">Centre Equestre d'Agon-Coutainville — 02 44 84 99 96</p>
            </div>`,
          }),
        });
        if (response.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }

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
    await loadData();
  };

  const resetComposer = () => {
    setSentResult(null);
    setSubject("");
    setBody("");
    setSelectedAudience("");
  };

  const insertVariable = (variable: string) => {
    setBody((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${variable}`);
  };

  const variables = [
    { token: "[prenom_parent]", label: "Prénom parent" },
    { token: "[nom_famille]", label: "Nom famille" },
    { token: "[prenom_enfant]", label: "Prénom cavalier" },
    { token: "[nb_enfants]", label: "Nb. cavaliers" },
    { token: "[lien_reservation]", label: "Lien réservation" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mb-6">
        <div className="mb-1 font-body text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Communication</div>
        <h1 className="font-display text-2xl font-bold text-blue-800 md:text-3xl">Campagnes email</h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-gray-500">
          Choisissez précisément les familles, personnalisez le message et gardez une trace de chaque envoi.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card padding="sm" className="!rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-2xl font-bold text-blue-800">{familiesWithEmail}</div>
              <div className="mt-1 font-body text-xs font-bold text-blue-900">emails joignables</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><AtSign size={18} /></div>
          </div>
        </Card>
        <Card padding="sm" className="!rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-2xl font-bold text-blue-800">{history.length}</div>
              <div className="mt-1 font-body text-xs font-bold text-blue-900">campagnes envoyées</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50 text-gold-600"><Mail size={18} /></div>
          </div>
        </Card>
        <Card padding="sm" className="!rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-2xl font-bold text-green-600">{latestCampaign?.sentOk || 0}</div>
              <div className="mt-1 font-body text-xs font-bold text-blue-900">dernier envoi réussi</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600"><CheckCircle2 size={18} /></div>
          </div>
        </Card>
        <Card padding="sm" className="!rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-2xl font-bold text-orange-600">{families.length - familiesWithEmail}</div>
              <div className="mt-1 font-body text-xs font-bold text-blue-900">sans adresse email</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><AlertTriangle size={18} /></div>
          </div>
        </Card>
      </div>

      <div className="mb-6 inline-flex rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_5px_24px_rgba(12,26,46,0.035)]">
        {([
          ["newsletter", "Nouvelle campagne", Mail],
          ["historique", "Historique", History],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-xl border-none px-4 py-2.5 font-body text-sm font-semibold transition-colors ${
              tab === id ? "bg-blue-600 text-white shadow-sm" : "bg-transparent text-gray-500 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "newsletter" && sentResult && (
        <Card padding="lg" className="mx-auto max-w-2xl text-center !rounded-3xl">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${sentResult.fail === 0 ? "bg-green-50 text-green-600" : "bg-orange-50 text-orange-600"}`}>
            {sentResult.fail === 0 ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
          </div>
          <h2 className="font-display text-2xl font-bold text-blue-800">Campagne terminée</h2>
          <p className="mt-2 font-body text-sm text-gray-500">
            {sentResult.ok} email{sentResult.ok > 1 ? "s" : ""} envoyé{sentResult.ok > 1 ? "s" : ""} avec succès.
          </p>
          {sentResult.fail > 0 && (
            <p className="mt-2 font-body text-sm font-semibold text-red-600">
              {sentResult.fail} envoi{sentResult.fail > 1 ? "s" : ""} en échec.
            </p>
          )}
          <button
            onClick={resetComposer}
            className="mt-6 rounded-xl border-none bg-blue-600 px-5 py-3 font-body text-sm font-bold text-white hover:bg-blue-700"
          >
            Créer une nouvelle campagne
          </button>
        </Card>
      )}

      {tab === "newsletter" && !sentResult && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card padding="md" className="h-fit !rounded-2xl xl:sticky xl:top-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg font-bold text-blue-800">1. Destinataires</div>
                <div className="mt-0.5 font-body text-xs text-gray-500">Choisissez un seul segment</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Users size={18} /></div>
            </div>

            <div className="flex flex-col gap-2">
              {audiences.map((audience) => {
                const active = selectedAudience === audience.id;
                return (
                  <button
                    type="button"
                    key={audience.id}
                    onClick={() => setSelectedAudience(audience.id)}
                    disabled={audience.count === 0}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all disabled:cursor-default disabled:opacity-45 ${
                      active
                        ? "border-blue-300 bg-blue-50 shadow-[0_0_0_2px_rgba(32,80,160,0.08)]"
                        : "border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                    }`}
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                      {audience.count}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`font-body text-sm font-bold ${active ? "text-blue-800" : "text-gray-700"}`}>{audience.label}</div>
                      <div className="mt-0.5 font-body text-[11px] leading-snug text-gray-400">{audience.description}</div>
                    </div>
                    <ChevronRight size={15} className={active ? "text-blue-500" : "text-gray-300"} />
                  </button>
                );
              })}
            </div>

            <div className={`mt-4 rounded-xl px-4 py-3 ${recipients.length > 0 ? "bg-green-50" : "bg-gray-50"}`}>
              <div className={`font-display text-2xl font-bold ${recipients.length > 0 ? "text-green-700" : "text-gray-400"}`}>{recipients.length}</div>
              <div className={`font-body text-xs font-semibold ${recipients.length > 0 ? "text-green-700" : "text-gray-500"}`}>
                destinataire{recipients.length > 1 ? "s" : ""} sélectionné{recipients.length > 1 ? "s" : ""}
              </div>
            </div>
          </Card>

          <Card padding="md" className="!rounded-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg font-bold text-blue-800">2. Rédiger le message</div>
                <div className="mt-0.5 font-body text-xs text-gray-500">Les variables seront personnalisées famille par famille</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50 text-gold-600"><Sparkles size={18} /></div>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-body text-xs text-gray-500">Modèle prêt à l’emploi :</span>
                <button
                  type="button"
                  onClick={() => {
                    setSubject("[prenom_enfant] nous manque au club 🐴");
                    setBody(
                      "Bonjour,\n\n" +
                      "En préparant la saison 2026-2027, on s'est aperçus que [prenom_enfant] ne s'était pas encore réinscrit(e) — et honnêtement, ça nous tenait à cœur de prendre de ses nouvelles.\n\n" +
                      "Au club, chaque cavalier compte, et on n'a pas envie de laisser filer les choses sans comprendre. Est-ce une question d'horaires, de niveau ou de groupe, de budget, une baisse de motivation, ou simplement un changement dans votre organisation ? Il n'y a aucune mauvaise réponse — savoir pourquoi nous aide surtout à nous améliorer, et parfois à trouver une solution à laquelle vous n'auriez pas pensé.\n\n" +
                      "Un petit mot en réponse suffit. Et pour faire au plus simple, on se permettra aussi de vous passer un coup de fil dans les prochains jours, juste pour échanger. Si vous préférez qu'on vous appelle à un moment précis (ou pas du tout), dites-le-nous, on s'adapte.\n\n" +
                      "La porte reste grande ouverte : si [prenom_enfant] a envie de remonter en selle, on sera ravis de le/la retrouver.\n\n" +
                      "À très vite,\nNicolas et toute l'équipe du Centre Équestre d'Agon-Coutainville"
                    );
                    if (!selectedAudience) setSelectedAudience("non-reinscrits");
                  }}
                  className="font-body text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 cursor-pointer"
                >
                  🐴 Relance « non-réinscrits »
                </button>
              </div>
              <div>
                <label className="mb-1.5 block font-body text-xs font-bold text-blue-900">Objet de l’email</label>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Ex. Les stages d’été sont ouverts"
                  className="w-full border border-gray-200 bg-gray-50 px-4 py-3 font-body text-sm focus:bg-white"
                />
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="font-body text-xs font-bold text-blue-900">Message</label>
                  <span className="font-body text-[11px] text-gray-400">{body.length} caractère{body.length > 1 ? "s" : ""}</span>
                </div>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={12}
                  placeholder={"Bonjour [prenom_parent],\n\nÉcrivez votre message ici…"}
                  className="w-full resize-y border border-gray-200 bg-gray-50 px-4 py-3 font-body text-sm leading-relaxed focus:bg-white"
                />
              </div>

              <div>
                <div className="mb-2 font-body text-xs font-bold text-blue-900">Insérer une information personnalisée</div>
                <div className="flex flex-wrap gap-2">
                  {variables.map((variable) => (
                    <button
                      type="button"
                      key={variable.token}
                      onClick={() => insertVariable(variable.token)}
                      className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 font-body text-xs font-semibold text-blue-700 hover:border-blue-200 hover:bg-blue-100"
                      title={variable.token}
                    >
                      + {variable.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Clock3 size={15} className="text-gray-400" />
                  <div className="font-body text-xs font-bold text-gray-600">Avant l’envoi</div>
                </div>
                <p className="font-body text-xs leading-relaxed text-gray-500">
                  Vérifie le segment, l’objet et le nombre de destinataires. L’envoi est personnalisé et enregistré dans l’historique.
                </p>
              </div>

              <button
                onClick={handleSend}
                disabled={!selectedAudience || !subject.trim() || recipients.length === 0 || sending}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border-none px-6 py-3.5 font-body text-sm font-bold transition-colors ${
                  !selectedAudience || !subject.trim() || recipients.length === 0 || sending
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                }`}
              >
                {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                {sending
                  ? `Envoi en cours à ${recipients.length} famille${recipients.length > 1 ? "s" : ""}…`
                  : `Envoyer à ${recipients.length} famille${recipients.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </Card>
        </div>
      )}

      {tab === "historique" && (
        <div>
          {history.length === 0 ? (
            <Card padding="lg" className="text-center !rounded-2xl">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-300"><History size={24} /></div>
              <div className="font-body text-sm font-bold text-blue-800">Aucune campagne envoyée</div>
              <p className="mt-1 font-body text-xs text-gray-500">Les futurs envois apparaîtront ici.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {history.map((item: any) => {
                const date = item.sentAt?.seconds ? new Date(item.sentAt.seconds * 1000) : new Date();
                const total = Number(item.sentOk || 0) + Number(item.sentFail || 0);
                return (
                  <Card key={item.id} padding="md" className="!rounded-2xl">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Mail size={19} /></div>
                        <div className="min-w-0">
                          <div className="truncate font-body text-sm font-bold text-blue-900">{item.subject || "Sans objet"}</div>
                          <div className="mt-1 font-body text-xs text-gray-400">
                            {date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div className="mt-2 line-clamp-2 font-body text-xs leading-relaxed text-gray-500">{item.body || ""}</div>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        <Badge color="blue">{total} destinataire{total > 1 ? "s" : ""}</Badge>
                        <Badge color="green">{item.sentOk || 0} envoyé{Number(item.sentOk || 0) > 1 ? "s" : ""}</Badge>
                        {Number(item.sentFail || 0) > 0 && <Badge color="red">{item.sentFail} échec{Number(item.sentFail) > 1 ? "s" : ""}</Badge>}
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
