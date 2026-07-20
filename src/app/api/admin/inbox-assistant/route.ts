import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { calculerDisponibilites, labelFr, jourFr } from "@/lib/dispo";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/inbox-assistant
// Étape 1 + 2 de l'assistant email : à partir d'un mail (from/subject/body),
//   - classe (info / inscription / administratif / autre)
//   - résume en 1-2 phrases
//   - rédige un BROUILLON de réponse (jamais envoyé automatiquement)
//   - propose 0-3 prestations RÉELLEMENT disponibles (ancrage : créneaux,
//     places restantes, tarifs, + contexte enfants si l'expéditeur est connu)
//
// Ne fait AUCUNE action (pas d'envoi, pas d'inscription). Sortie = suggestions.
// ═══════════════════════════════════════════════════════════════════

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// YYYY-MM-DD du jour à Paris (process Vercel en UTC → on force Europe/Paris).
function todayParis(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA → "YYYY-MM-DD"
}

// Jour de semaine + date en toutes lettres (ex "mardi 14 juillet 2026").
// Nom du jour seul (ex "samedi").
// Samedi et dimanche du week-end à venir (à partir de today).
function prochainWeekend(today: string): { samedi: string; dimanche: string } {
  const d = new Date(today + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=dim .. 6=sam
  const toSat = (6 - dow + 7) % 7; // 0 si aujourd'hui samedi
  const sat = new Date(d);
  sat.setUTCDate(d.getUTCDate() + toSat);
  const sun = new Date(sat);
  sun.setUTCDate(sat.getUTCDate() + 1);
  return { samedi: sat.toISOString().slice(0, 10), dimanche: sun.toISOString().slice(0, 10) };
}

function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000
  );
}
const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Passe légère (Haiku) : extrait la fenêtre de dates demandée dans le mail, pour
// ne charger QUE les créneaux utiles (coût des lectures). Dégrade en fenêtre
// proche par défaut si échec ou demande vague.
async function extractPeriode(
  from: string,
  subject: string,
  body: string,
  today: string
): Promise<{ start: string; end: string; borne: boolean }> {
  const defStart = today;
  const defEnd = addDaysStr(today, 63);
  const we = prochainWeekend(today);
  try {
    const sys = `Tu extrais la fenêtre de dates demandée dans un mail. Date du jour : ${today}. Ce week-end = ${we.samedi} au ${we.dimanche}.
Réponds UNIQUEMENT en JSON : {"dateStart":"YYYY-MM-DD"|null,"dateEnd":"YYYY-MM-DD"|null}
Règles : "cette semaine" = lundi→dimanche de la semaine du jour ; "ce week-end" = ${we.samedi} et ${we.dimanche} ; "demain" = jour+1 ; "en juillet 2027" = 2027-07-01 à 2027-07-31 ; "la semaine du 20 juillet" = ce lundi-là au dimanche ; "cet été" = juin→août de l'année concernée. Si AUCUNE période n'est mentionnée, mets les deux à null.`;
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      system: sys,
      messages: [{ role: "user", content: `${subject || ""}\n${(body || "").slice(0, 1500)}` }],
    });
    const raw = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
    const j = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    let start = isDate(j.dateStart) ? j.dateStart : null;
    let end = isDate(j.dateEnd) ? j.dateEnd : null;

    if (!start && !end) return { start: defStart, end: defEnd, borne: false };
    if (start && !end) end = addDaysStr(start, 62);
    if (!start && end) start = today;
    // On ne lit pas le passé.
    if (start! < today) start = today;
    if (end! < start!) end = addDaysStr(start!, 62);
    // Cap de sécurité : jamais plus de ~100 jours lus d'un coup.
    if (daysBetween(start!, end!) > 100) end = addDaysStr(start!, 100);
    return { start: start!, end: end!, borne: true };
  } catch {
    return { start: defStart, end: defEnd, borne: false };
  }
}

function ageFrom(birth: any): number | null {
  if (!birth) return null;
  let d: Date | null = null;
  if (typeof birth === "string") d = new Date(birth.length <= 10 ? birth + "T12:00:00Z" : birth);
  else if (birth?.toDate) d = birth.toDate();
  else if (birth?.seconds) d = new Date(birth.seconds * 1000);
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { from, subject, body, threadId } = await req.json();

    // ── Contexte du FIL : si le mail vient de Gmail (threadId), on charge
    //    l'historique complet de la conversation. Indispensable quand la
    //    famille re-répond avec les infos demandées (âge d'un enfant, choix
    //    de dates…) : l'analyse voit la demande initiale ET nos réponses.
    let historiqueFil: { from: string; date: string; body: string }[] = [];
    if (typeof threadId === "string" && threadId.trim()) {
      try {
        const { gmailIsConnected, gmailGetThread } = await import("@/lib/gmail");
        if (await gmailIsConnected()) {
          const fil = await gmailGetThread(threadId.trim());
          // Tous les messages SAUF le dernier (= celui analysé), bornés.
          historiqueFil = fil.slice(0, -1).slice(-6).map((m) => ({
            from: m.from,
            date: m.date,
            body: (m.body || "").slice(0, 1200),
          }));
        }
      } catch (e) {
        console.warn("[inbox-assistant] fil Gmail illisible:", (e as any)?.message);
      }
    }
    if (!body && !subject) {
      return NextResponse.json({ error: "Mail vide (subject/body requis)" }, { status: 400 });
    }

    const today = todayParis();
    // Passe légère : on détecte la période demandée pour ne lire que l'utile.
    const periode = await extractPeriode(from || "", subject || "", body || "", today);

    // ── 1. Créneaux disponibles SUR LA PÉRIODE DEMANDÉE (lecture ciblée) ───
    //    Logique partagée : lib/dispo.ts (assistant email, agent admin, et
    //    à terme agent téléphonique). La fenêtre vient de extractPeriode.
    const { autresDispo, activitesDispo, stagesDispo, stageGroupMap, creneauMap } =
      await calculerDisponibilites(adminDb, {
        today,
        start: periode.start,
        end: periode.end,
      });

    // ── 2. Contexte famille si l'expéditeur est connu ─────────────────
    let familleContexte: any = null;
    let familyId: string | null = null;
    const childrenMap = new Map<string, string>(); // childId → prénom (validation)
    const childElig = new Map<string, { age: number | null; galop: string | null }>();
    const fromEmail = (from || "").trim().toLowerCase();
    if (fromEmail) {
      try {
        const famSnap = await adminDb
          .collection("families")
          .where("parentEmail", "==", fromEmail)
          .limit(1)
          .get();
        if (!famSnap.empty) {
          familyId = famSnap.docs[0].id;
          const f = famSnap.docs[0].data() as any;
          (f.children || []).forEach((ch: any) => {
            if (ch.id) {
              childrenMap.set(ch.id, ch.firstName || "");
              childElig.set(ch.id, {
                age: ageFrom(ch.birthDate),
                galop: ch.galopLevel && ch.galopLevel !== "—" ? ch.galopLevel : null,
              });
            }
          });
          familleContexte = {
            parent: f.parentName || "",
            enfants: (f.children || []).map((ch: any) => ({
              childId: ch.id || null,
              prenom: ch.firstName || "",
              age: ageFrom(ch.birthDate),
              galop: ch.galopLevel && ch.galopLevel !== "—" ? ch.galopLevel : null,
            })),
          };
        }
      } catch {
        /* expéditeur inconnu → pas de contexte */
      }
    }

    // ── 3. Appel IA (JSON strict) ─────────────────────────────────────
    const systemPrompt = `Tu es l'assistant de la boîte email du Centre Équestre Poney Club d'Agon-Coutainville.
Tu aides le gérant à traiter ses mails. Tu réponds UNIQUEMENT en JSON valide, sans texte autour, sans balises Markdown.

Règles:
- Ton chaleureux, professionnel, tutoiement évité avec les familles (vouvoiement), signé "Le Centre Équestre d'Agon-Coutainville".
- Tu ne proposes QUE des prestations présentes dans la liste "activitesDispo" fournie (places réelles). Jamais d'invention de date, de tarif ou de place.
- COMPLET : une activité avec "complet": true EXISTE mais n'a plus de place. Tu ne dois JAMAIS la proposer à la réservation. En revanche, si elle correspond à la demande (âge, niveau, date), tu dois la MENTIONNER explicitement comme complète et proposer l'alternative la plus proche qui a des places (autre semaine, autre horaire). Exemple : "le stage baby de cette semaine-là est complet, mais il reste des places la semaine du 3 août".
- INTERDICTION ABSOLUE d'écrire qu'une tranche d'âge n'est pas accueillie, ou qu'il n'y a "rien pour les tout-petits", SANS avoir vérifié la liste. Si une activité de la bonne tranche d'âge existe mais est complète, dis "complet" — jamais "nous n'en proposons pas". Ces deux phrases n'ont pas le même sens pour une famille.
- PRIX D'UN STAGE — RÈGLE ABSOLUE : "prixSemaineTTC" est le prix de la TOTALITÉ du séjour décrit par "nbJours", JAMAIS un prix par jour ni par séance. Tu n'écris JAMAIS "la journée", "la séance", "par jour" ou "/jour" à côté de ce montant. Formulation imposée : "175 € pour la semaine complète (5 jours)" en reprenant nbJours tel quel. Si nbJours vaut 1, écris "175 € pour ce stage" — jamais "la journée", qui laisserait croire à un tarif journalier.
- Un tarif à la journée n'existe QUE si "prixJour" est fourni. Dans ce cas seulement tu peux écrire un prix par jour, et tu le distingues explicitement du prix semaine.
- TARIF MANQUANT : si "prixSemaineTTC" est absent ou vaut 0, n'écris jamais un prix inventé ni "gratuit". Écris "tarif à confirmer" et signale-le au gérant dans le résumé.
- STAGES COMPLETS : une activité avec "complet": true existe bel et bien mais n'a plus de place. Ne la mets JAMAIS dans "suggestions" (elle serait refusée). En revanche, tu dois l'ÉVOQUER dans le brouillon si elle correspond à la demande : dis clairement qu'elle est complète pour ces dates, puis propose la même prestation à une autre date si elle figure dans la liste avec des places. Exemple : "Le stage baby de la semaine du 27 juillet est malheureusement complet, mais il reste des places celle du 3 août."
- INTERDICTION ABSOLUE de conclure qu'une tranche d'âge n'est pas servie à partir de la seule absence de créneau libre. Si aucune activité (complète ou non) ne correspond à l'âge demandé, écris que tu vérifies et que tu reviens vers la famille — n'affirme JAMAIS "nous n'avons rien pour cet âge" ni "nos stages commencent à X ans".
- LES STAGES SONT DES SEMAINES : chaque stage fourni est un GROUPE couvrant "nbJours" jours ("periode" = du premier au dernier jour, détail dans "joursDates"). Son "prixSemaineTTC" est le prix de la SEMAINE COMPLÈTE (les nbJours jours), PAS un prix par jour. Dans le brouillon, écris toujours le prix sans ambiguïté : "175 € la semaine complète (5 jours)". Si "demiJourneeOuverte"=true, précise qu'une formule à la journée existe (avec "prixJour" si fourni, sinon "tarif journée sur demande"). Ne propose JAMAIS deux fois la même semaine de stage.
- DEMANDE "À PARTIR DU <date>" (ou toute contrainte de dates) : une semaine de stage qui COMMENCE AVANT la date demandée ne doit JAMAIS être proposée en semaine complète (la famille raterait des jours déjà passés pour elle). Deux cas : (a) si "demiJourneeOuverte"=true, propose-la en MODE JOURS avec uniquement les jours ≥ la date demandée — mets "mode":"jours" et "jours":[dates choisies parmi joursDates] dans la suggestion, et dans le brouillon annonce clairement "possible à la journée : jeudi 30 et vendredi 31 (X €/jour)" ; (b) sinon, ne la propose pas et passe à la semaine suivante qui commence à ou après la date demandée (mode "semaine"). Pour une semaine complète compatible avec les dates, mets "mode":"semaine" et laisse "jours" à null.
- ÉVENTAIL : propose jusqu'à 5 suggestions couvrant les options pertinentes, pas une seule piste. Pour une demande de stage "à partir du <date>" : la semaine entamée en mode jours (si ouverte à la journée) ET la ou les semaines complètes suivantes du bon niveau. Si la famille évoque aussi promenades/randos ou reste ouverte ("stage ou promenade"), ajoute la ou les alternatives éligibles (promenade, rando) qui correspondent. Ne gonfle pas artificiellement : uniquement des options réellement pertinentes et éligibles.
- Pour CHAQUE suggestion : si c'est un STAGE, reprends son "groupId" exact (copie-le tel quel) et laisse creneauId à null ; si c'est une autre activité (cours, promenade…), reprends son "creneauId" exact et laisse groupId à null. N'invente jamais un identifiant.
- Si la demande vise un enfant précis de la famille connue, ajoute son "childId" (repris depuis le contexte famille). Sinon laisse childId à null.
- Si une activité, choisis-la en fonction de la demande et, si connu, de l'âge/galop de l'enfant (souvent indiqués dans le titre, ex "Stage 3/4 ans", "galop d'argent 8/10 ans").
- Pour le niveau/galop : base-toi sur le contexte famille, mais reste PRUDENT — formule "d'après nos informations, <enfant> est <galop>" et invite à confirmer le niveau. N'affirme jamais catégoriquement "correspond parfaitement à son niveau" (la fiche peut être à jour ou non).
- Équivalence des niveaux (galops "poney" ↔ numérotés, MÊME progression, à respecter strictement) : Galop de Bronze = débutant/initiation ; Galop d'Argent = Galop 1 ; Galop d'Or = Galop 2 ; puis Galop 3, 4, 5, 6, 7 (numérotés). Choisis un stage du MÊME niveau que l'enfant (ex : enfant Galop d'Or = Galop 2 → stage "Galop d'or" ou "Galop 2" ; enfant Galop d'Argent = Galop 1 → stage "Galop d'argent" ou "Galop 1" ; débutant → stage "Bronze"/initiation). JAMAIS un niveau inférieur ni supérieur au sien. Si aucun stage du bon niveau n'est disponible, dis-le honnêtement et propose de confirmer, plutôt que de rétrograder.
- Dates : le vrai jour de chaque activité est dans son champ "jour" — NE LE RECALCULE JAMAIS, reprends-le tel quel. "ce week-end" = le samedi et dimanche fournis (CE WEEK-END) ; "cette semaine" = la semaine (lundi→dimanche) contenant la date du jour ; "demain" = jour+1. Ne propose comme "ce week-end" que des activités dont la date correspond au samedi/dimanche fournis ; sinon précise honnêtement la vraie date.
- ÉLIGIBILITÉ : chaque activité peut porter des critères "ageMin", "ageMax", "galopRequired" et un texte libre "conditionsAcces". Respecte-les STRICTEMENT. Applique ce qui est VÉRIFIABLE d'après le contexte famille (âge, galop) : ne propose une activité que si l'enfant satisfait l'âge [ageMin, ageMax] et le galop requis (table d'équivalence). Pour les conditions du texte "conditionsAcces" qui ne sont PAS vérifiables dans nos données (ex : "maîtrise du trot enlevé", "maîtrise des 3 allures", "évaluation préalable en carrière"), ne les affirme jamais comme acquises : mentionne-les comme "à confirmer avec la famille". Si "conditionsAcces" mentionne une clause de non-remboursement ou une évaluation préalable, rappelle-la dans ta réponse. Dans le doute, demande à confirmer plutôt que de proposer à tort.
- PRIORITÉ DES CRITÈRES D'ÂGE : seuls les champs "ageMin"/"ageMax" (et "conditionsAcces") font foi. Si le TITRE d'une activité mentionne un âge ou une tranche d'âge (ex : "Stage bronze 6/7 ans") qui contredit les champs, IGNORE l'âge du titre : c'est un libellé commercial, les champs sont la règle réelle. Exemple : titre "6/7 ans" mais ageMin=5 et ageMax=8 → un enfant de 8 ans EST éligible, propose-lui l'activité. Ne rejette JAMAIS un enfant sur la seule base d'un âge écrit dans le titre.
- Demi-journées : certains stages sont ouverts à la journée (champ "demiJourneeOuverte"=true, avec éventuellement "prixJour"). Si la famille cherche une formule plus courte, tu peux mentionner que ce stage est aussi accessible à la journée. Ne le fais que si demiJourneeOuverte=true.
- Si rien ne correspond ou si le mail n'est pas une demande de prestation, laisse "suggestions" vide.
- NOUVELLE FAMILLE : si l'expéditeur est INCONNU de la base ET que le mail est une demande d'inscription/prestation, remplis "nouvelleFamille" pour pré-remplir la fiche : parentName = nom du parent tel que signé ou déduit du mail (sinon null), enfants = ceux mentionnés dans le mail avec UNIQUEMENT les infos réellement présentes (prénom obligatoire ; nom, âge, galop seulement s'ils sont écrits — n'invente JAMAIS un âge ou un niveau). Sinon laisse "nouvelleFamille" à null.
- Le brouillon est une PROPOSITION que le gérant relira et enverra lui-même. Ne promets jamais une inscription faite.

Format JSON attendu:
{
  "classification": "info" | "inscription" | "administratif" | "autre",
  "resume": "1-2 phrases",
  "brouillon": "corps du mail de réponse en français",
  "suggestions": [ { "groupId": "..." | null, "creneauId": "..." | null, "mode": "semaine" | "jours" | null, "jours": ["YYYY-MM-DD", ...] | null, "childId": "..." | null, "pourquoi": "raison courte" } ],
  "nouvelleFamille": null | { "parentName": "..." | null, "enfants": [ { "prenom": "...", "nom": "..." | null, "age": 9 | null, "galop": "..." | null } ] }
}`;

    const we = prochainWeekend(today);
    const userContent = `DATE DU JOUR : ${labelFr(today)} (${today}).
CE WEEK-END = samedi ${we.samedi} et dimanche ${we.dimanche}.
ACTIVITÉS FOURNIES CI-DESSOUS : elles couvrent la période du ${periode.start} au ${periode.end} (extraite de la demande). Si la famille évoque une AUTRE période que celle-ci, invite-la poliment à préciser ses dates, que tu vérifieras — ne dis pas "rien de disponible".
IMPORTANT : n'essaie JAMAIS de recalculer un jour de semaine toi-même. Chaque activité fournie contient déjà son champ "jour" (le vrai jour de la semaine) — utilise-le tel quel.

MAIL REÇU (LE PLUS RÉCENT — c'est à CELUI-CI que tu réponds)
De: ${from || "(inconnu)"}
Objet: ${subject || "(sans objet)"}
Corps:
${(body || "").slice(0, 4000)}

${historiqueFil.length > 0 ? `HISTORIQUE DU FIL (du plus ancien au plus récent — contexte de la conversation : demande initiale de la famille et réponses déjà envoyées par le centre. Combine ces informations avec le mail reçu : si la famille répond à une question qu'on lui a posée, rattache sa réponse à la demande d'origine, ne repars pas de zéro, et ne repose pas une question déjà répondue) :
${JSON.stringify(historiqueFil)}

` : ""}CONTEXTE FAMILLE (si expéditeur connu):
${familleContexte ? JSON.stringify(familleContexte) : "expéditeur inconnu de la base"}

ACTIVITÉS (à venir). ATTENTION : certaines portent "complet": true — elles EXISTENT mais n'ont plus de place.
${JSON.stringify(activitesDispo)}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = message.content
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Réponse IA non parsable", raw: cleaned.slice(0, 500) },
        { status: 502 }
      );
    }

    // ── Re-validation SERVEUR des suggestions (le client/IA ne décide rien) ──
    // Pour chaque suggestion : le créneau doit exister et avoir encore de la
    // place ; l'enfant (si fourni) doit appartenir à la famille ; le prix est
    // repris de la source. `actionable` = prêt pour une future inscription.
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [];
    const suggestions = rawSuggestions.map((s: any) => {
      const childId = s.childId && childrenMap.has(s.childId) ? s.childId : null;
      const childName = childId ? childrenMap.get(childId) || null : null;

      // Contrôle d'âge serveur (mutualisé groupe/créneau).
      const checkAge = (ageMin: any, ageMax: any): { ok: boolean; note: string | null } => {
        if (!childId) return { ok: true, note: null };
        const age = childElig.get(childId)?.age ?? null;
        if (age === null) return { ok: true, note: null };
        if (typeof ageMin === "number" && age < ageMin) return { ok: false, note: `réservé dès ${ageMin} ans` };
        if (typeof ageMax === "number" && age > ageMax) return { ok: false, note: `réservé jusqu'à ${ageMax} ans` };
        return { ok: true, note: null };
      };

      // ── Cas STAGE SEMAINE (groupId) : semaine entière OU sous-ensemble de jours ──
      if (s.groupId && stageGroupMap.has(s.groupId)) {
        const g = stageGroupMap.get(s.groupId)!;
        const { ok: ageOk, note: ageNote } = checkAge(g.ageMin, g.ageMax);

        // Mode JOURS : sous-ensemble demandé par l'IA, VALIDÉ contre les vrais
        // jours du groupe (dates inconnues ignorées). Autorisé seulement si le
        // stage est ouvert à la journée.
        const askedDays: string[] = Array.isArray(s.jours) ? s.jours.filter((d: any) => typeof d === "string") : [];
        const joursChoisis = g.joursDetail.filter((j: any) => askedDays.includes(j.date));
        const modeJours =
          s.mode === "jours" && g.demiJourneeOuverte && joursChoisis.length > 0 && joursChoisis.length < g.nbJours;

        if (modeJours) {
          // Prix AUTORITAIRE mode jours : price{n}days (admin) > prixJour × n > prorata semaine.
          const n = joursChoisis.length;
          const pc = g.pricePerCount?.[n];
          const prixJours =
            typeof pc === "number" && pc > 0
              ? pc
              : typeof g.prixJour === "number" && g.prixJour > 0
              ? Math.round(g.prixJour * n * 100) / 100
              : typeof g.prixSemaineTTC === "number"
              ? Math.round((g.prixSemaineTTC / g.nbJours) * n * 100) / 100
              : null;
          // Chaque jour retenu doit avoir une place. Le filtre "spots > 0" a été
          // retiré de lib/dispo.ts (les créneaux complets sont désormais fournis
          // à l'IA pour qu'elle puisse dire "complet"), donc on ne peut plus
          // supposer qu'un jour présent est réservable.
          const placeOk =
            joursChoisis.length > 0 && joursChoisis.every((j: any) => !j.complet);
          const actionable = placeOk && ageOk;
          return {
            groupId: s.groupId,
            creneauId: null,
            creneauIds: joursChoisis.map((j: any) => j.creneauId),
            titre: g.titre,
            type: g.type,
            date: joursChoisis[0].date,
            dateFin: joursChoisis[joursChoisis.length - 1].date,
            periode: joursChoisis.map((j: any) => `${j.jour} ${j.date.slice(8, 10)}`).join(" + "),
            nbJours: n,
            nbJoursSemaine: g.nbJours,
            horaire: g.horaire,
            places: g.places,
            prixTTC: prixJours, // prix AUTORITAIRE des jours choisis
            prixMode: "jours",
            prixJour: g.prixJour,
            childId,
            childName,
            pourquoi: s.pourquoi || "",
            actionable,
            note: !ageOk ? ageNote : null,
          };
        }

        // Mode SEMAINE (défaut)
        const placeOk = g.places > 0;
        const actionable = placeOk && ageOk;
        return {
          groupId: s.groupId,
          creneauId: null,
          creneauIds: g.creneauIds, // TOUS les jours de la semaine (inscription entière)
          titre: g.titre,
          type: g.type,
          date: g.dateDebut,
          dateFin: g.dateFin,
          periode: g.periode,
          nbJours: g.nbJours,
          nbJoursSemaine: g.nbJours,
          horaire: g.horaire,
          places: g.places,
          prixTTC: g.prixSemaineTTC, // prix AUTORITAIRE de la SEMAINE
          prixMode: "semaine",
          prixJour: g.prixJour,
          childId,
          childName,
          pourquoi: s.pourquoi || "",
          actionable,
          note: !placeOk ? "complet" : !ageOk ? ageNote : null,
        };
      }

      // ── Cas activité simple (creneauId) : comportement existant ──
      const cr = s.creneauId ? creneauMap.get(s.creneauId) : null;
      const placeOk = !!cr && cr.spots > 0;
      const { ok: ageOk, note: ageNote } = cr ? checkAge(cr.ageMin, cr.ageMax) : { ok: true, note: null };
      const actionable = placeOk && ageOk;
      return {
        groupId: null,
        creneauId: cr ? s.creneauId : null,
        creneauIds: cr ? [s.creneauId] : [],
        titre: cr ? cr.titre : "",
        type: cr ? cr.type : null,
        date: cr ? cr.date : null,
        dateFin: null,
        periode: null,
        nbJours: 1,
        horaire: cr ? cr.horaire : null,
        places: cr ? cr.spots : 0,
        prixTTC: cr ? cr.prixTTC : null, // prix AUTORITAIRE (source créneau)
        prixMode: "unitaire",
        prixJour: null,
        childId,
        childName,
        pourquoi: s.pourquoi || "",
        actionable,
        note: !cr ? "créneau/stage introuvable ou plus dispo" : !placeOk ? "complet" : !ageOk ? ageNote : null,
      };
    });

    return NextResponse.json({
      ok: true,
      classification: parsed.classification || "autre",
      resume: parsed.resume || "",
      brouillon: parsed.brouillon || "",
      suggestions,
      familleConnue: !!familleContexte,
      familyId,
      enfants: familleContexte ? familleContexte.enfants : [],
      // Pré-remplissage fiche nouvelle famille (expéditeur inconnu uniquement).
      // C'est une PROPOSITION que l'admin relit et corrige avant création.
      nouvelleFamille: !familleContexte && parsed.nouvelleFamille ? parsed.nouvelleFamille : null,
      // Catalogue COMPLET des prestations disponibles (mêmes données
      // autoritaires que les suggestions) pour l'ajout MANUEL par l'admin :
      // stages en semaines + autres activités, sans enfant ciblé.
      catalogue: [
        ...Array.from(stageGroupMap.values()).map((g: any) => ({
          groupId: g.groupId,
          creneauId: null,
          creneauIds: g.creneauIds,
          titre: g.titre,
          type: g.type,
          date: g.dateDebut,
          dateFin: g.dateFin,
          periode: g.periode,
          nbJours: g.nbJours,
          nbJoursSemaine: g.nbJours,
          horaire: g.horaire,
          places: g.places,
          prixTTC: g.prixSemaineTTC,
          prixMode: "semaine",
          prixJour: g.prixJour,
          childId: null,
          childName: null,
          pourquoi: "",
          actionable: g.places > 0,
          note: g.places > 0 ? null : "complet",
          manual: true,
        })),
        ...autresDispo.slice(0, 40).map((a: any) => ({
          groupId: null,
          creneauId: a.creneauId,
          creneauIds: [a.creneauId],
          titre: a.titre,
          type: a.type,
          date: a.date,
          dateFin: null,
          periode: `${a.jour} ${a.date}`,
          nbJours: 1,
          nbJoursSemaine: 1,
          horaire: a.horaire,
          places: a.places,
          prixTTC: a.prixTTC,
          prixMode: "unitaire",
          prixJour: null,
          childId: null,
          childName: null,
          pourquoi: "",
          actionable: a.places > 0,
          note: a.places > 0 ? null : "complet",
          manual: true,
        })),
      ].sort((x: any, y: any) => (x.date < y.date ? -1 : 1)),
      nbActivitesDispo: activitesDispo.length,
    });
  } catch (e: any) {
    console.error("[inbox-assistant]", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
