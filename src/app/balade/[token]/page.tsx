"use client";

/**
 * Page publique /balade/[token] — choix de la famille quand sa balade
 * collective est sous le minimum de participants.
 *
 * Accessible sans connexion (lien reçu par email, token = id du doc
 * `balade-petit-groupe`, même mécanisme que /satisfaction/[token]).
 * Trois choix : maintien avec supplément (paiement CAWL), report, avoir.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, CalendarClock, Coins, Users, Undo2 } from "lucide-react";

interface Infos {
  activityTitle: string;
  date: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  childrenNames: string[];
  minParticipants: number;
  inscritsActuels: number;
  minimumAtteint: boolean;
  supplementParCavalier: number;
  supplementTotal: number;
  status: "attente" | "supplement_choisi" | "report" | "avoir" | "remboursement";
  supplementPaye: boolean;
  avoirAmount: number | null;
  remboursementAmount: number | null;
  expiree: boolean;
}

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export default function BaladeChoixPage() {
  const params = useParams();
  const token = String((params as any)?.token || "");

  const [infos, setInfos] = useState<Infos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState<string | null>(null); // choix en cours d'envoi
  const [done, setDone] = useState<{ status: string; avoirAmount?: number; remboursementAmount?: number } | null>(null);

  useEffect(() => {
    if (!token) { setError("Lien invalide."); setLoading(false); return; }
    fetch(`/api/public/balade-choix?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error("Ce lien est introuvable ou a expiré.");
        if (!r.ok) throw new Error("Une erreur est survenue.");
        return r.json();
      })
      .then((d: Infos) => setInfos(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const choisir = async (choice: "supplement" | "report" | "avoir" | "remboursement") => {
    if (sending) return;
    if (choice === "avoir" && !confirm(
      "Confirmer l'annulation ?\n\nVos cavaliers seront désinscrits de la balade et un avoir du montant payé sera crédité sur votre compte famille."
    )) return;
    if (choice === "remboursement" && !confirm(
      "Confirmer l'annulation avec remboursement ?\n\nVos cavaliers seront désinscrits de la balade et le centre vous remboursera intégralement les sommes payées, par votre moyen de paiement d'origine."
    )) return;
    setSending(choice); setError("");
    try {
      const res = await fetch("/api/public/balade-choix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, choice }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Choix déjà enregistré (autre onglet, double clic) → recharger l'état
        setDone({ status: body.status || "attente" });
        return;
      }
      if (!res.ok) throw new Error(body.error || "Échec de l'envoi. Merci de réessayer.");
      if (choice === "supplement" && body.url) {
        window.location.href = body.url; // page de paiement CAWL
        return;
      }
      setDone({ status: body.status, avoirAmount: body.avoirAmount, remboursementAmount: body.remboursementAmount });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
  }

  if (error && !infos) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-md text-center text-slate-600">{error}</div>
      </div>
    );
  }

  const inf = infos!;
  const statusFinal = done?.status || (inf.status !== "attente" ? inf.status : null);

  // ── Écrans d'état (choix déjà fait / balade passée / minimum atteint) ──
  if (inf.expiree && !statusFinal) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h1 className="text-xl font-bold text-slate-800">Ce lien a expiré</h1>
          <p className="text-slate-500 mt-2">La date de la balade est passée. Contactez le centre équestre au 02 44 84 99 96 si besoin.</p>
        </div>
      </div>
    );
  }

  if (statusFinal) {
    const messages: Record<string, { titre: string; texte: string }> = {
      supplement_choisi: {
        titre: inf.supplementPaye ? "Balade maintenue — supplément réglé" : "Supplément en cours de paiement",
        texte: inf.supplementPaye
          ? "Merci ! Votre balade est maintenue en petit comité. À très bientôt !"
          : "Votre choix est enregistré. Si le paiement n'a pas abouti, rouvrez ce lien pour réessayer.",
      },
      report: {
        titre: "Demande de report enregistrée",
        texte: "Nous vous recontactons très vite pour convenir ensemble d'une nouvelle date. Merci !",
      },
      avoir: {
        titre: "Annulation enregistrée",
        texte: (done?.avoirAmount ?? inf.avoirAmount ?? 0) > 0
          ? `Un avoir de ${eur(done?.avoirAmount ?? inf.avoirAmount ?? 0)} a été crédité sur votre compte famille. Il est utilisable sur toutes nos prestations depuis votre espace cavalier.`
          : "Vos cavaliers ont été désinscrits. Le centre équestre vous recontacte pour le remboursement.",
      },
      remboursement: {
        titre: "Annulation enregistrée — remboursement en cours",
        texte: (done?.remboursementAmount ?? inf.remboursementAmount ?? 0) > 0
          ? `Vos cavaliers ont été désinscrits. Le centre vous rembourse ${eur(done?.remboursementAmount ?? inf.remboursementAmount ?? 0)} sous quelques jours, par votre moyen de paiement d'origine.`
          : "Vos cavaliers ont été désinscrits. Le centre équestre vous recontacte pour organiser le remboursement.",
      },
    };
    const m = messages[statusFinal] || { titre: "Choix enregistré", texte: "Merci !" };
    const rejouerPaiement = statusFinal === "supplement_choisi" && !inf.supplementPaye && !inf.expiree;
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48} />
          <h1 className="text-xl font-bold text-slate-800">{m.titre}</h1>
          <p className="text-slate-500 mt-2">{m.texte}</p>
          {rejouerPaiement && (
            <button type="button" onClick={() => choisir("supplement")} disabled={!!sending}
              className="mt-5 bg-[#1e3a5f] text-white font-semibold rounded-lg py-3 px-6 hover:bg-[#15293f] disabled:opacity-50 inline-flex items-center justify-center gap-2 border-none cursor-pointer">
              {sending && <Loader2 className="animate-spin" size={16} />} Payer le supplément ({eur(inf.supplementTotal)})
            </button>
          )}
          {error && <p className="text-rose-600 text-sm mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  if (inf.minimumAtteint) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48} />
          <h1 className="text-xl font-bold text-slate-800">Bonne nouvelle !</h1>
          <p className="text-slate-500 mt-2">
            De nouveaux cavaliers se sont inscrits : la balade <strong>{inf.activityTitle}</strong> du{" "}
            {inf.dateLabel} a atteint son minimum de participants. Elle est <strong>maintenue sans supplément</strong>. À très bientôt !
          </p>
        </div>
      </div>
    );
  }

  // ── Écran de choix ──
  const nb = inf.childrenNames.length || 1;
  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-[#1e3a5f] text-white px-6 py-5">
          <div className="text-xs uppercase tracking-wide text-white/70">Centre Équestre d'Agon-Coutainville</div>
          <h1 className="text-lg font-bold mt-1">Votre balade du {inf.dateLabel}</h1>
          <p className="text-white/80 text-sm mt-1">
            {inf.activityTitle} · {inf.startTime}–{inf.endTime}
            {inf.childrenNames.length > 0 ? ` · ${inf.childrenNames.join(", ")}` : ""}
          </p>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <Users className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-amber-800 leading-relaxed m-0">
              La balade compte pour l'instant <strong>{inf.inscritsActuels} inscrit{inf.inscritsActuels > 1 ? "s" : ""}</strong> sur
              un minimum de <strong>{inf.minParticipants} participants</strong>. Plusieurs possibilités s'offrent à vous —
              et si d'autres cavaliers s'inscrivent d'ici là, la balade sera maintenue sans supplément.
            </p>
          </div>

          {inf.supplementParCavalier > 0 && (
            <button type="button" onClick={() => choisir("supplement")} disabled={!!sending}
              className="text-left rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:border-emerald-400 p-4 cursor-pointer disabled:opacity-50 transition-colors w-full">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                🐴 Maintenir la balade en petit comité
                {sending === "supplement" && <Loader2 className="animate-spin" size={16} />}
              </div>
              <p className="text-sm text-emerald-700 mt-1 m-0">
                Supplément de {eur(inf.supplementParCavalier)} par cavalier{nb > 1 ? ` — soit ${eur(inf.supplementTotal)} pour ${nb} cavaliers` : ""},
                à régler en ligne par carte bancaire. La balade part, quoi qu'il arrive.
              </p>
            </button>
          )}

          <button type="button" onClick={() => choisir("report")} disabled={!!sending}
            className="text-left rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 p-4 cursor-pointer disabled:opacity-50 transition-colors w-full">
            <div className="flex items-center gap-2 font-bold text-blue-800">
              <CalendarClock size={18} /> Reporter à une autre date
              {sending === "report" && <Loader2 className="animate-spin" size={16} />}
            </div>
            <p className="text-sm text-blue-700 mt-1 m-0">
              Nous vous recontactons pour convenir ensemble d'une date qui vous arrange. Votre paiement reste acquis pour la nouvelle date.
            </p>
          </button>

          <button type="button" onClick={() => choisir("avoir")} disabled={!!sending}
            className="text-left rounded-xl border-2 border-slate-200 bg-slate-50 hover:border-slate-400 p-4 cursor-pointer disabled:opacity-50 transition-colors w-full">
            <div className="flex items-center gap-2 font-bold text-slate-700">
              <Coins size={18} /> Annuler avec un avoir
              {sending === "avoir" && <Loader2 className="animate-spin" size={16} />}
            </div>
            <p className="text-sm text-slate-600 mt-1 m-0">
              Vos cavaliers sont désinscrits et le montant payé est crédité en avoir, utilisable sur toutes nos prestations (cours, stages, balades…).
            </p>
          </button>

          <button type="button" onClick={() => choisir("remboursement")} disabled={!!sending}
            className="text-left rounded-xl border-2 border-rose-200 bg-rose-50 hover:border-rose-400 p-4 cursor-pointer disabled:opacity-50 transition-colors w-full">
            <div className="flex items-center gap-2 font-bold text-rose-700">
              <Undo2 size={18} /> Annuler avec remboursement
              {sending === "remboursement" && <Loader2 className="animate-spin" size={16} />}
            </div>
            <p className="text-sm text-rose-600 mt-1 m-0">
              Vos cavaliers sont désinscrits et le centre vous rembourse intégralement les sommes payées, par votre moyen de paiement d&apos;origine.
            </p>
          </button>

          {error && <div className="text-rose-600 text-sm">{error}</div>}

          <p className="text-xs text-slate-400 m-0">
            Sans réponse de votre part avant la veille de la balade, nous vous appellerons pour décider ensemble.
            Une question ? 02 44 84 99 96.
          </p>
        </div>
      </div>
    </div>
  );
}
