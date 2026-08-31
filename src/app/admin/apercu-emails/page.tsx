"use client";

import { useMemo, useState } from "react";
import { Monitor, Smartphone, Mail, RefreshCw } from "lucide-react";
import { emailTemplates as T } from "@/lib/email-templates";

type PreviewItem = {
  id: string;
  label: string;
  description: string;
  subject: string;
  html: string;
};

function buildPreviews(): PreviewItem[] {
  const items = [
    {
      id: "stage-acompte-du",
      label: "Stage · acompte à régler",
      description: "Inscription enregistrée, place retenue, acompte encore dû.",
      email: T.confirmationStage({
        parentName: "Marie Lefèvre",
        enfants: [
          { name: "Léa Lefèvre", prix: 145, remise: 0 },
          { name: "Tom Lefèvre", prix: 130, remise: 15 },
        ],
        stageTitle: "Stage poney — Toussaint",
        dates: "Du lundi 19 au vendredi 23 octobre 2026",
        totalTTC: 275,
        acompte: 82.5,
        solde: 192.5,
        dateSolde: "12 octobre 2026",
        lienSepare: true,
      }),
    },
    {
      id: "stages-groupes-a-regler",
      label: "Stages · 5 cavaliers, 3 stages, 1 email",
      description:
        "Ce que reçoit une famille inscrite depuis l'administration : un seul message pour tous "
        + "les stages inscrits dans la foulée, et une place retenue tant que rien n'est encaissé.",
      email: T.confirmationStages({
        parentName: "Marie Lefèvre",
        stages: [
          {
            stageTitle: "Stage poney — Toussaint",
            dates: "lun. 19, mar. 20, mer. 21, jeu. 22, ven. 23 octobre",
            enfants: [
              { name: "Léa Lefèvre", prix: 145, remise: 0 },
              { name: "Tom Lefèvre", prix: 130, remise: 15 },
            ],
          },
          {
            stageTitle: "Stage galop 2 — Toussaint",
            dates: "lun. 26, mar. 27, mer. 28 octobre",
            enfants: [
              { name: "Jules Lefèvre", prix: 120, remise: 0 },
              { name: "Alice Lefèvre", prix: 105, remise: 15 },
            ],
          },
          {
            stageTitle: "Stage baby-poney",
            dates: "jeu. 29 octobre",
            enfants: [{ name: "Rose Lefèvre", prix: 45, remise: 0 }],
          },
        ],
        totalTTC: 545,
        aRegler: 545,
        solde: 0,
      }),
    },
    {
      id: "stages-groupes-acompte",
      label: "Stages groupés · acompte à régler",
      description: "Même message, quand l'acompte de 30 € par enfant est demandé par lien de paiement.",
      email: T.confirmationStages({
        parentName: "Marie Lefèvre",
        stages: [
          {
            stageTitle: "Stage poney — Toussaint",
            dates: "lun. 19 au ven. 23 octobre",
            enfants: [
              { name: "Léa Lefèvre", prix: 145, remise: 0 },
              { name: "Tom Lefèvre", prix: 130, remise: 15 },
            ],
          },
          {
            stageTitle: "Stage galop 2 — Toussaint",
            dates: "lun. 26 au mer. 28 octobre",
            enfants: [{ name: "Jules Lefèvre", prix: 120, remise: 0 }],
          },
        ],
        totalTTC: 395,
        aRegler: 90,
        solde: 305,
        dateSolde: "12 octobre",
        lienSepare: true,
      }),
    },
    {
      id: "stage-acompte-recu",
      label: "Stage · acompte reçu",
      description: "La place est acquise, le solde reste à venir.",
      email: T.confirmationStage({
        parentName: "Marie Lefèvre",
        enfants: [{ name: "Léa Lefèvre", prix: 145, remise: 0 }],
        stageTitle: "Stage poney — Toussaint",
        dates: "Du lundi 19 au vendredi 23 octobre 2026",
        totalTTC: 145,
        acompte: 30,
        solde: 115,
        dateSolde: "12 octobre 2026",
        acompteRegle: true,
      }),
    },
    {
      id: "stage-paye",
      label: "Stage · payé intégralement",
      description: "Confirmation finale avec paiement complet.",
      email: T.confirmationStage({
        parentName: "Marie Lefèvre",
        enfants: [
          { name: "Léa Lefèvre", prix: 145, remise: 0 },
          { name: "Tom Lefèvre", prix: 130, remise: 15 },
        ],
        stageTitle: "Stage poney — Toussaint",
        dates: "Du lundi 19 au vendredi 23 octobre 2026",
        totalTTC: 275,
        paiementConfirme: true,
        montantRegle: 275,
      }),
    },
    {
      id: "cours",
      label: "Cours particulier",
      description: "Réservation de cours avec montant à régler.",
      email: T.confirmationCours({
        parentName: "Marie Lefèvre",
        childName: "Léa",
        coursTitle: "Cours Galop 2",
        date: "mercredi 14 octobre 2026",
        horaire: "14h00 – 15h00",
        prix: 22,
      }),
    },
    {
      id: "paiement",
      label: "Paiement reçu",
      description: "Accusé de réception d'un règlement.",
      email: T.confirmationPaiement({
        parentName: "Marie Lefèvre",
        montant: 82.5,
        mode: "Carte bancaire",
        prestations: "Acompte stage Toussaint",
        pointsGagnes: 82,
        pointsTotal: 340,
        tauxFidelite: 100,
        minPointsFidelite: 500,
      }),
    },
    {
      id: "rappel-stage",
      label: "Rappel de stage",
      description: "Message envoyé à l'approche du stage.",
      email: T.rappelStage({
        parentName: "Marie Lefèvre",
        enfants: ["Léa", "Tom"],
        stageTitle: "Stage poney — Toussaint",
        dateDebut: "lundi 19 octobre 2026",
        horaire: "9h30 – 12h00",
      }),
    },
    {
      id: "impaye",
      label: "Rappel de paiement",
      description: "Relance pour un solde restant dû.",
      email: T.rappelImpaye({
        parentName: "Marie Lefèvre",
        montant: 192.5,
        prestations: "Solde stage Toussaint",
      }),
    },
    {
      id: "lien-paiement",
      label: "Lien de paiement",
      description: "Email court avec bouton de règlement sécurisé.",
      email: T.lienPaiement({
        parentName: "Marie Lefèvre",
        label: "Solde stage Toussaint",
        montant: 192.5,
        lienPaiement: "#",
      }),
    },
    {
      id: "bienvenue",
      label: "Bienvenue",
      description: "Création d'un nouvel espace famille.",
      email: T.bienvenueNouvelleFamille({ parentName: "Marie Lefèvre" }),
    },
    {
      id: "avoir",
      label: "Avoir",
      description: "Désinscription avec création d'un avoir.",
      email: T.desinscriptionAvoir({
        parentName: "Marie Lefèvre",
        childName: "Tom",
        activite: "Stage poney — Toussaint",
        montantAvoir: 130,
        refAvoir: "AV-2026-0043",
      }),
    },
  ];

  return items.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    subject: item.email.subject,
    html: item.email.html,
  }));
}

export default function ApercuEmailsPage() {
  const previews = useMemo(buildPreviews, []);
  const [selectedId, setSelectedId] = useState(previews[0]?.id ?? "");
  const [mobile, setMobile] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const selected = previews.find((p) => p.id === selectedId) ?? previews[0];

  if (!selected) return null;

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F2EEE7;">${selected.html}</body></html>`;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-amber-600">
              <Mail size={16} />
              Atelier email
            </div>
            <h1 className="font-display text-3xl font-bold text-slate-900 md:text-4xl">Aperçu des emails</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Prévisualisation des principaux messages transactionnels avec le nouvel habillage premium. Aucun email n'est envoyé depuis cette page.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobile(false)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${!mobile ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              <Monitor size={16} /> Bureau
            </button>
            <button
              type="button"
              onClick={() => setMobile(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${mobile ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
            >
              <Smartphone size={16} /> Mobile
            </button>
            <button
              type="button"
              onClick={() => setFrameKey((v) => v + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              title="Recharger l'aperçu"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-6">
            <div className="px-3 pb-3 pt-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Modèles</div>
            <div className="space-y-1.5">
              {previews.map((preview) => {
                const active = preview.id === selected.id;
                return (
                  <button
                    key={preview.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(preview.id);
                      setFrameKey((v) => v + 1);
                    }}
                    className={`w-full rounded-xl px-3 py-3 text-left transition ${active ? "bg-[#0F2C56] text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"}`}
                  >
                    <div className="text-sm font-semibold">{preview.label}</div>
                    <div className={`mt-1 text-xs leading-5 ${active ? "text-white/65" : "text-slate-400"}`}>{preview.description}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0">
            <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Objet du mail</div>
              <div className="mt-1 font-medium text-slate-900">{selected.subject}</div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-[#DDD8CF] p-3 shadow-sm md:p-6">
              <div
                className="mx-auto overflow-hidden rounded-[18px] bg-[#F2EEE7] shadow-xl transition-[width] duration-300"
                style={{ width: mobile ? 390 : 720, maxWidth: "100%" }}
              >
                <iframe
                  key={`${selected.id}-${frameKey}-${mobile ? "m" : "d"}`}
                  title={`Aperçu ${selected.label}`}
                  srcDoc={srcDoc}
                  className="block h-[1100px] w-full border-0 bg-[#F2EEE7]"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Cet écran simule le rendu dans un navigateur. Le HTML des emails reste volontairement construit en tableaux et styles inline pour conserver une bonne compatibilité Gmail, Apple Mail et Outlook.
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
