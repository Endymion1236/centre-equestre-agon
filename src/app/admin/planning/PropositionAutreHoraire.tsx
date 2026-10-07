"use client";

/**
 * Dans la liste d'attente d'un créneau : un autre horaire du même créneau
 * est ouvert la même semaine (le « Stage Premier sabot » de 16 h 30 à côté
 * de celui de 10 h, complet). Un bouton prévient les familles en attente par
 * email ; elles restent sur la liste d'attente et choisissent.
 *
 * La règle (même nom, même semaine, autre horaire, places libres) et le
 * regroupement par famille sont dans lib/liste-attente-alternatives, testés.
 */

import { useEffect, useState } from "react";
import { arrayUnion, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { URL_APP } from "@/lib/url-app";
import { toParisDateString } from "@/lib/date-local";
import { lundiDe } from "@/lib/meme-stage";
import {
  alternativesMemeSemaine, dureeMinutes, envoisAlternative, libelleHoraire, libelleJours,
  type Alternative, type EnvoiAlternative,
} from "@/lib/liste-attente-alternatives";
import {
  emailLayout, emailTitre, emailButton, emailPanneau, emailLigne,
  emailParagraphe as P, emailSignature,
} from "@/lib/email-templates";

function htmlProposition(creneau: any, alt: Alternative, envoi: EnvoiAlternative, dureeOrigine: number, lien: string) {
  const enfants = envoi.enfants.filter(Boolean).join(" et ") || "votre enfant";
  return emailLayout([
    emailTitre("Un autre horaire s'ouvre"),
    P(`Bonjour <strong>${envoi.familyName}</strong>,`),
    P(`${enfants} ${envoi.enfants.length > 1 ? "sont" : "est"} sur la liste d'attente de <strong>${creneau.activityTitle}</strong> (${creneau.startTime.replace(":", " h ")}). Nous venons d'ouvrir un autre horaire la même semaine :`),
    emailPanneau(creneau.activityTitle, [
      emailLigne("Jours", libelleJours(alt)),
      emailLigne("Horaire", libelleHoraire(alt, dureeOrigine)),
      emailLigne("Places", `${alt.placesLibres} disponible${alt.placesLibres > 1 ? "s" : ""}`),
    ].join("")),
    P("Les places partent dans l'ordre des réservations. Vous restez sur la liste d'attente de l'horaire initial : si une place s'y libère, nous vous préviendrons comme prévu."),
    emailButton("Réserver cet horaire", lien),
    P("Une question, ou plus simple par téléphone ? Appelez-nous au <strong>02 44 84 99 96</strong> ou répondez à ce message.", 13),
    emailSignature(),
  ].join("\n"), `Autre horaire — ${creneau.activityTitle}`);
}

export function PropositionAutreHoraire({ creneau, allCreneaux, allFamilies, waitlist, onEnvoye, panelToast }: {
  creneau: any;
  allCreneaux: any[];
  allFamilies: any[];
  waitlist: any[];
  onEnvoye: () => Promise<void>;
  panelToast: (message: string, type?: any) => void;
}) {
  const [envoiEnCours, setEnvoiEnCours] = useState("");
  // Les créneaux de toute la semaine : en vue « jour », le planning n'a
  // chargé que la journée affichée, et l'autre horaire peut être un autre jour.
  const [semaine, setSemaine] = useState<any[] | null>(null);
  const aAttente = waitlist.length > 0;
  useEffect(() => {
    if (!aAttente || !creneau?.date) return;
    const lundi = lundiDe(creneau.date);
    if (!lundi) return;
    const d = new Date(lundi + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 6);
    const dimanche = d.toISOString().slice(0, 10);
    let actif = true;
    getDocs(query(collection(db, "creneaux"), where("date", ">=", lundi), where("date", "<=", dimanche)))
      .then(snap => { if (actif) setSemaine(snap.docs.map(x => ({ id: x.id, ...x.data() }))); })
      .catch(e => console.warn("[attente] créneaux de la semaine illisibles :", e));
    return () => { actif = false; };
  }, [aAttente, creneau?.date, creneau?.id]);
  if (!aAttente) return null;
  const alternatives = alternativesMemeSemaine(creneau, semaine || allCreneaux, toParisDateString());
  if (!alternatives.length) return null;
  const dureeOrigine = dureeMinutes(creneau.startTime, creneau.endTime);
  const emailFiche = (fid: string) => allFamilies.find((f: any) => f.firestoreId === fid)?.parentEmail || "";

  const prevenir = async (alt: Alternative) => {
    const { envois, dejaPrevenues, sansEmail } = envoisAlternative(waitlist, alt.cle, emailFiche);
    if (!envois.length) {
      panelToast(dejaPrevenues ? "Toutes les familles en attente ont déjà été prévenues de cet horaire." : "Aucune famille en attente n'a d'adresse email.", "warning");
      return;
    }
    if (!confirm(`Prévenir ${envois.length} famille${envois.length > 1 ? "s" : ""} par email de l'horaire ${libelleHoraire(alt, dureeOrigine)} ?\n\n${envois.map(e => `• ${e.familyName} (${e.enfants.join(", ")})`).join("\n")}${sansEmail.length ? `\n\nSans email, à appeler : ${sansEmail.join(", ")}` : ""}`)) return;
    setEnvoiEnCours(alt.cle);
    const origine = typeof window !== "undefined" ? window.location.origin : URL_APP;
    const lien = `${origine}/espace-cavalier/reserver?creneau=${encodeURIComponent(alt.creneaux[0].id)}`;
    let ok = 0;
    const echecs: string[] = [];
    for (const envoi of envois) {
      try {
        const res = await authFetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: envoi.email,
            subject: `Un autre horaire s'ouvre — ${creneau.activityTitle}`,
            html: htmlProposition(creneau, alt, envoi, dureeOrigine, lien),
            context: "admin_attente_autre_horaire",
            template: "attenteAutreHoraire",
            familyId: envoi.familyId,
            creneauId: alt.creneaux[0].id,
          }),
        });
        const rep = await res.json().catch(() => null);
        if (!res.ok || rep?.skipped) throw new Error(rep?.error || rep?.reason || `erreur ${res.status}`);
        // Trace sur chaque entrée : pas de second envoi de la même proposition.
        await Promise.all(envoi.entreeIds.map(id => updateDoc(doc(db, "waitlist", id), {
          alternativesProposees: arrayUnion(alt.cle),
          alternativeProposeeLe: new Date().toISOString(),
        })));
        ok++;
      } catch (e: any) {
        echecs.push(`${envoi.familyName} : ${e?.message || e}`);
      }
    }
    setEnvoiEnCours("");
    await onEnvoye();
    if (echecs.length) panelToast(`${ok} famille(s) prévenue(s). Échec pour ${echecs.join(" ; ")}`, "error");
    else panelToast(`✅ ${ok} famille${ok > 1 ? "s" : ""} prévenue${ok > 1 ? "s" : ""} par email${sansEmail.length ? ` — à appeler (sans email) : ${sansEmail.join(", ")}` : ""}`, "success");
  };

  return (
    <div className="px-4 py-3 bg-blue-50 border-t border-orange-100 space-y-2">
      {alternatives.map(alt => {
        const { envois, dejaPrevenues } = envoisAlternative(waitlist, alt.cle, emailFiche);
        return (
          <div key={alt.cle} className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-body text-xs text-blue-900">
              💡 Autre horaire cette semaine : <strong>{libelleJours(alt)}</strong>, {libelleHoraire(alt, dureeOrigine)} — {alt.placesLibres} place{alt.placesLibres > 1 ? "s" : ""}
              {dejaPrevenues > 0 && <span className="text-green-700"> · {dejaPrevenues} déjà prévenue{dejaPrevenues > 1 ? "s" : ""}</span>}
            </div>
            {envois.length > 0 && (
              <button type="button" disabled={!!envoiEnCours} onClick={() => prevenir(alt)}
                className="font-body text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                {envoiEnCours === alt.cle ? "Envoi…" : `✉️ Prévenir ${envois.length} famille${envois.length > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
