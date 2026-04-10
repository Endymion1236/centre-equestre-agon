import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface RapprochementRequest {
  type: "rapprochement";
  bankLines: { date: string; label: string; amount: number; matched: boolean; matchDetail?: string }[];
  encaissements: { date: string; mode: string; montant: number; familyName: string; activityTitle?: string }[];
  periode: string;
}

interface AssistantRequest {
  type: "assistant";
  question: string;
  context: {
    totalCA?: number;
    totalEncaisse?: number;
    nbPaiements?: number;
    nbImpayés?: number;
    topFamilles?: { name: string; total: number }[];
    periode?: string;
    encaissementsParMode?: Record<string, number>;
    remises?: { date: string; total: number; pointee: boolean }[];
    _systemOverride?: string; // prompt système personnalisé (VoiceAssistant)
    [key: string]: any; // autres données contextuelles libres
  };
}

interface SuggestionsRequest {
  type: "suggestions_planning";
  creneaux: {
    id: string;
    activityTitle: string;
    activityType: string;
    date: string;
    startTime: string;
    endTime: string;
    monitor: string;
    maxPlaces: number;
    enrolled: number;
    fill: number; // 0-1
    status: string;
  }[];
  periode: string; // "semaine du X au Y" ou "jour du X"
  viewMode: string;
}

interface EmailRepriseRequest {
  type: "email_reprise";
  creneau: {
    activityTitle: string;
    activityType: string;
    date: string;
    startTime: string;
    endTime: string;
    monitor: string;
    maxPlaces: number;
  };
  cavaliers: {
    firstName: string;
    galopLevel: string;
    parentName: string;
  }[];
  context?: string; // info supplémentaire optionnelle (météo, annulation, etc.)
}

interface ThemeStageRequest {
  type: "theme_stage";
  stageTitle: string;
  stageDate: string;
  enfants: {
    childId: string;
    childName: string;
    themesVus: string[];
  }[];
  themesDisponibles: string[];
}

interface BilanPedaRequest {
  type: "bilan_peda";
  transcript: string;
  child: {
    firstName: string;
    lastName?: string;
    galopLevel?: string;
    objectifs?: { id: string; label: string; status: string }[];
    recentNotes?: string[];
  };
  seance: {
    activityTitle: string;
    date: string;
    horseName?: string;
  };
}

interface GenerateEmailTemplateRequest {
  type: "generate_email_template";
  templateKey: string;
  templateLabel: string;
  variables: string[];
  currentBody?: string;
  userPrompt?: string;
}

type IARequest = RapprochementRequest | AssistantRequest | SuggestionsRequest | EmailRepriseRequest | BilanPedaRequest | GenerateEmailTemplateRequest | ThemeStageRequest;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY non configurée dans Vercel." },
      { status: 500 }
    );
  }

  try {
    const body: IARequest = await request.json();

    // ── Rapprochement bancaire ────────────────────────────────────────────────
    if (body.type === "rapprochement") {
      const nonMatched = body.bankLines.filter(l => !l.matched);
      const matched = body.bankLines.filter(l => l.matched);
      const totalBanque = body.bankLines.reduce((s, l) => s + l.amount, 0);
      const totalEnc = body.encaissements.reduce((s, e) => s + e.montant, 0);
      const ecart = totalBanque - totalEnc;

      const prompt = `Tu es l'assistant comptable du Centre Équestre d'Agon-Coutainville.
Analyse ce rapprochement bancaire et explique les écarts en français clair et concis.

PÉRIODE : ${body.periode}
TOTAL RELEVÉ BANCAIRE : ${totalBanque.toFixed(2)}€
TOTAL ENCAISSEMENTS FIRESTORE : ${totalEnc.toFixed(2)}€
ÉCART : ${ecart.toFixed(2)}€

LIGNES BANCAIRES RAPPROCHÉES (${matched.length}) :
${matched.map(l => `- ${l.date} | ${l.label} | ${l.amount.toFixed(2)}€ → ${l.matchDetail}`).join("\n")}

LIGNES NON RAPPROCHÉES (${nonMatched.length}) :
${nonMatched.length === 0 ? "Aucune ✅" : nonMatched.map(l => `- ${l.date} | ${l.label} | ${l.amount.toFixed(2)}€`).join("\n")}

ENCAISSEMENTS DU MOIS (${body.encaissements.length}) :
${body.encaissements.slice(0, 30).map(e => `- ${e.date} | ${e.mode} | ${e.montant.toFixed(2)}€ | ${e.familyName}`).join("\n")}
${body.encaissements.length > 30 ? `... et ${body.encaissements.length - 30} autres` : ""}

Fournis une analyse structurée en 3 parties :
1. **Résumé** (2-3 phrases sur l'état général du rapprochement)
2. **Lignes non rapprochées** — pour chaque ligne bancaire non matchée, explique ce que c'est probablement (frais bancaires, remise multi-jours, paiement externe, etc.) et ce qu'il faut faire
3. **Écart de ${ecart.toFixed(2)}€** — explication et action recommandée

Sois concis, pratique, en français. Pas de markdown complexe, juste des titres en gras et des listes.`;

      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";

      return NextResponse.json({
        success: true,
        analysis: text,
        stats: {
          totalBanque: totalBanque.toFixed(2),
          totalEnc: totalEnc.toFixed(2),
          ecart: ecart.toFixed(2),
          matched: matched.length,
          nonMatched: nonMatched.length,
          tauxRapprochement: body.bankLines.length > 0
            ? Math.round((matched.length / body.bankLines.length) * 100)
            : 100,
        },
      });
    }

    // ── Assistant comptable ───────────────────────────────────────────────────
    if (body.type === "assistant") {
      const ctx = body.context;

      // Si le VoiceAssistant passe un prompt système personnalisé, l'utiliser
      const systemOverride = ctx._systemOverride;

      const prompt = systemOverride || `Tu es l'assistant comptable du Centre Équestre d'Agon-Coutainville.
Réponds à cette question en français, de façon concise et pratique.
Tu as accès aux données suivantes :

PÉRIODE : ${ctx.periode || "non précisée"}
CA TTC FACTURÉ : ${ctx.totalCA?.toFixed(2) || "?"}€
TOTAL ENCAISSÉ : ${ctx.totalEncaisse?.toFixed(2) || "?"}€
NB PAIEMENTS : ${ctx.nbPaiements || "?"}
NB IMPAYÉS : ${ctx.nbImpayés || "?"}
${ctx.encaissementsParMode ? `ENCAISSEMENTS PAR MODE :\n${Object.entries(ctx.encaissementsParMode).map(([k,v])=>`- ${k}: ${(v as number).toFixed(2)}€`).join("\n")}` : ""}
${ctx.topFamilles ? `TOP FAMILLES :\n${ctx.topFamilles.slice(0,5).map(f=>`- ${f.name}: ${f.total.toFixed(2)}€`).join("\n")}` : ""}
${ctx.remises ? `REMISES (${ctx.remises.length}) :\n${ctx.remises.map(r=>`- ${r.date}: ${r.total.toFixed(2)}€ ${r.pointee?"✓ pointée":"⚠ non pointée"}`).join("\n")}` : ""}

QUESTION : ${body.question}

Réponds directement à la question. Sois précis, chiffré si possible, et suggère une action concrète si pertinent.`;

      const messages: any[] = systemOverride
        ? [{ role: "user", content: `${systemOverride}\n\nQUESTION : ${body.question}` }]
        : [{ role: "user", content: prompt }];

      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 512,
        messages,
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";
      return NextResponse.json({ success: true, answer: text });
    }

    // ── Suggestions planning ──────────────────────────────────────────────────
    if (body.type === "suggestions_planning") {
      const { creneaux, periode, viewMode } = body;

      const sousRemplis = creneaux.filter(c => c.fill < 0.5 && c.status !== "closed" && c.enrolled < c.maxPlaces);
      const complets = creneaux.filter(c => c.fill >= 1);
      const vides = creneaux.filter(c => c.enrolled === 0 && c.status !== "closed");
      const totalPlaces = creneaux.reduce((s, c) => s + c.maxPlaces, 0);
      const totalInscrits = creneaux.reduce((s, c) => s + c.enrolled, 0);
      const tauxGlobal = totalPlaces > 0 ? Math.round((totalInscrits / totalPlaces) * 100) : 0;

      // Grouper par type d'activité
      const parType: Record<string, { total: number; inscrits: number }> = {};
      creneaux.forEach(c => {
        if (!parType[c.activityType]) parType[c.activityType] = { total: 0, inscrits: 0 };
        parType[c.activityType].total += c.maxPlaces;
        parType[c.activityType].inscrits += c.enrolled;
      });

      const prompt = `Tu es le conseiller en gestion du Centre Équestre d'Agon-Coutainville.
Analyse le planning de cette période et donne des suggestions concrètes et actionnables.

PÉRIODE ANALYSÉE : ${periode}
TAUX DE REMPLISSAGE GLOBAL : ${tauxGlobal}% (${totalInscrits}/${totalPlaces} places)

RÉPARTITION PAR ACTIVITÉ :
${Object.entries(parType).map(([type, d]) => `- ${type} : ${d.inscrits}/${d.total} (${Math.round(d.inscrits/d.total*100)}%)`).join("\n")}

CRÉNEAUX COMPLETS (${complets.length}) :
${complets.length === 0 ? "Aucun" : complets.map(c => `- ${c.date} ${c.startTime} | ${c.activityTitle} | ${c.monitor} | ${c.enrolled}/${c.maxPlaces} places`).join("\n")}

CRÉNEAUX SOUS-REMPLIS <50% (${sousRemplis.length}) :
${sousRemplis.length === 0 ? "Aucun ✅" : sousRemplis.map(c => `- ${c.date} ${c.startTime} | ${c.activityTitle} | ${c.monitor} | ${c.enrolled}/${c.maxPlaces} places (${Math.round(c.fill*100)}%)`).join("\n")}

CRÉNEAUX VIDES (${vides.length}) :
${vides.length === 0 ? "Aucun ✅" : vides.map(c => `- ${c.date} ${c.startTime} | ${c.activityTitle} | ${c.monitor}`).join("\n")}

Fournis une analyse en 3 parties :
1. **Bilan rapide** (1-2 phrases sur le taux de remplissage)
2. **Actions prioritaires** — liste de 3 à 5 actions concrètes pour les créneaux sous-remplis (ex: envoyer un rappel email, fusionner deux créneaux, ouvrir à de nouveaux inscrits, proposer une promotion, annuler si trop vide)
3. **Opportunités** — créneaux complets où tu pourrais ouvrir plus de places ou créer un créneau supplémentaire

Sois direct, pratique, en français. Chaque suggestion doit être immédiatement actionnable.`;

      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";

      return NextResponse.json({
        success: true,
        suggestions: text,
        stats: {
          tauxGlobal, totalInscrits, totalPlaces,
          sousRemplis: sousRemplis.length, complets: complets.length,
          vides: vides.length, total: creneaux.length,
        },
      });
    }

    // ── Email reprise IA ──────────────────────────────────────────────────────
    if (body.type === "email_reprise") {
      const { creneau, cavaliers, context } = body as any;
      const dateFormatee = new Date(creneau.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
      const niveaux = [...new Set((cavaliers as any[]).map((c:any) => c.galopLevel).filter((g:string) => g && g !== "—"))];
      const prenoms = (cavaliers as any[]).map((c:any) => c.firstName).slice(0, 5);
      const typeLabel: Record<string,string> = { cours:"cours collectif", cours_collectif:"cours collectif", cours_particulier:"cours particulier", stage:"stage", balade:"balade", ponyride:"pony ride", anniversaire:"anniversaire" };

      const [emailMsg, subjectMsg] = await Promise.all([
        client.messages.create({
          model: "claude-sonnet-4-5", max_tokens: 600,
          messages: [{ role: "user", content:
            `Tu es le responsable de communication du Centre Équestre d'Agon-Coutainville.
Rédige un email professionnel mais chaleureux pour les familles d'une reprise équestre.

REPRISE :
- Activité : ${creneau.activityTitle} (${typeLabel[creneau.activityType] || creneau.activityType})
- Date : ${dateFormatee}
- Horaire : ${creneau.startTime}–${creneau.endTime}
- Moniteur : ${creneau.monitor}
- Cavaliers : ${cavaliers.length} inscrits — prénoms : ${prenoms.join(", ")}${cavaliers.length > 5 ? "..." : ""}
- Niveaux : ${niveaux.length > 0 ? (niveaux as string[]).join(", ") : "mixtes"}
${context ? `- Contexte : ${context}` : ""}

CONSIGNES :
- Corps du message uniquement (sans "Objet:")
- Ton chaleureux, adapté au type (stage=enthousiaste, cours=rassurant, balade=convivial)
- Rappel date, heure et lieu
- Rappel casque homologué obligatoire, tenue adaptée
- 8-12 lignes
- Commence par "Bonjour,"
- Termine par "Cordialement,\nL'équipe du Centre Équestre d'Agon-Coutainville"` }],
        }),
        client.messages.create({
          model: "claude-sonnet-4-5", max_tokens: 60,
          messages: [{ role: "user", content:
            `Propose un objet d'email court (max 60 caractères) pour cette reprise équestre : "${creneau.activityTitle}" le ${dateFormatee} à ${creneau.startTime}. Réponds uniquement avec l'objet, sans guillemets.` }],
        }),
      ]);

      return NextResponse.json({
        success: true,
        emailBody: emailMsg.content[0].type === "text" ? emailMsg.content[0].text : "",
        suggestedSubject: subjectMsg.content[0].type === "text" ? subjectMsg.content[0].text.trim() : "",
      });
    }

    // ── Génération template email IA ─────────────────────────────────────────
    if (body.type === "generate_email_template") {
      const { templateKey, templateLabel, variables, currentBody, userPrompt } = body as any;
      const variablesList = (variables || []).map((v: string) => `{${v}}`).join(", ");

      const prompt = userPrompt?.trim()
        ? `Tu es un expert en email marketing pour un centre équestre familial. ${userPrompt}

Les variables disponibles sont : ${variablesList}
Retourne UNIQUEMENT le HTML du body (pas de <html>, <body>, <head>). Styles inline CSS. Ton chaleureux et professionnel. Maximum 15 lignes. Pas de markdown ni backticks.`
        : `Génère un email professionnel et chaleureux pour un centre équestre familial.
Template : ${templateLabel}
Variables disponibles : ${variablesList}
Ton accueillant et convivial, adapté à des familles avec enfants. Emojis pertinents (🐴, 📅, etc).
Retourne UNIQUEMENT le HTML du body (pas de <html>, <body>, <head>). Styles inline CSS. Maximum 15 lignes. Pas de markdown ni backticks.`;

      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "";
      const cleaned = text.replace(/```html?\s*/g, "").replace(/```\s*/g, "").trim();

      return NextResponse.json({ success: true, generatedBody: cleaned });
    }

    // ── Bilan pédagogique IA ──────────────────────────────────────────────────
    if (body.type === "bilan_peda") {
      const { transcript, child, seance } = body;
      const childFullName = child.lastName ? `${child.firstName} ${child.lastName}` : child.firstName;
      const objectifsActuels = (child.objectifs || [])
        .map(o => `- ${o.label} [${o.status}]`).join("\n") || "Aucun objectif défini";
      const notesRecentes = (child.recentNotes || []).slice(0, 3).join("\n") || "Aucune note récente";

      const prompt = `Tu es moniteur d'équitation au Centre Équestre d'Agon-Coutainville.
Tu viens de terminer une reprise et tu analyses le bilan dicté vocalement pour ${childFullName}.

CONTEXTE CAVALIER :
- Prénom/Nom : ${childFullName}
- Niveau actuel : ${child.galopLevel || "Non renseigné"}
- Séance : ${seance.activityTitle} le ${seance.date}${seance.horseName ? ` sur ${seance.horseName}` : ""}

OBJECTIFS EN COURS :
${objectifsActuels}

NOTES RÉCENTES :
${notesRecentes}

BILAN DICTÉ PAR LE MONITEUR :
"${transcript}"

Génère une réponse JSON structurée (et UNIQUEMENT du JSON, sans markdown ni backticks) :
{
  "note": {
    "pointsForts": "résumé des points positifs observés (2-3 phrases)",
    "aTravailler": "ce qui nécessite du travail (2-3 phrases)",
    "objectifSuivant": "1 objectif concret et mesurable pour la prochaine séance"
  },
  "galopUpdate": null ou "G1"/"G2"/"Bronze"/"Argent"/"Or"/etc. si le transcript mentionne clairement un changement de niveau,
  "objectifsAValider": ["id1", "id2"] liste des IDs d'objectifs existants à passer en 'valide' si le transcript le mentionne,
  "nouvelObjectif": null ou { "label": "...", "category": "technique/comportement/sécurité" } si un nouvel objectif doit être créé
}`;

      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
      let parsed: any = {};
      try {
        // Nettoyer les éventuels backticks
        const clean = raw.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        // Si JSON invalide, on retourne au moins le texte brut
        parsed = {
          note: {
            pointsForts: raw,
            aTravailler: "",
            objectifSuivant: "",
          },
          galopUpdate: null,
          objectifsAValider: [],
          nouvelObjectif: null,
        };
      }

      return NextResponse.json({ success: true, bilan: parsed });
    }

    // ── Suggestion de thème pour stage ─────────────────────────────────────
    if (body.type === "theme_stage") {
      const { stageTitle, stageDate, enfants, themesDisponibles } = body;

      // Calculer les thèmes non vus par chaque enfant
      const analyseParEnfant = enfants.map((e: any) => {
        const themesFaits = e.themesVus || [];
        const themesPasFaits = themesDisponibles.filter((t: string) => !themesFaits.includes(t));
        return { ...e, themesFaits, themesPasFaits };
      });

      // Compter combien d'enfants n'ont pas fait chaque thème
      const scoreThemes: Record<string, number> = {};
      themesDisponibles.forEach((t: string) => { scoreThemes[t] = 0; });
      analyseParEnfant.forEach((e: any) => {
        e.themesPasFaits.forEach((t: string) => { scoreThemes[t] = (scoreThemes[t] || 0) + 1; });
      });

      // Trier : le thème "nouveau pour le plus d'enfants" en premier
      const themesRankes = Object.entries(scoreThemes)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([theme, nb]) => ({ theme, nbEnfantsPasFait: nb }));

      const themesListStr = themesRankes.map((t: any) =>
        `- "${t.theme}" : ${t.nbEnfantsPasFait}/${enfants.length} enfants ne l'ont pas encore fait`
      ).join("\n");

      const enfantsDetailStr = analyseParEnfant.map((e: any) =>
        `- ${e.childName} : a déjà fait [${e.themesFaits.join(", ") || "aucun"}] — reste à faire : [${e.themesPasFaits.join(", ") || "tous faits !"}]`
      ).join("\n");

      const prompt = [
        "Tu es conseiller pédagogique pour un centre équestre.",
        `Un stage "${stageTitle}" se tient le ${stageDate}.`,
        `Il y a ${enfants.length} enfant(s) inscrit(s).`,
        "",
        "Voici l'analyse des thèmes narratifs :",
        themesListStr,
        "",
        "Détail par enfant :",
        enfantsDetailStr,
        "",
        "Donne une recommandation claire et concise en JSON UNIQUEMENT (sans markdown) :",
        "{",
        '  "themesRecommandes": [',
        '    { "theme": "nom du thème", "score": 0, "raison": "phrase courte" }',
        "  ],",
        '  "themeSuggere": "le meilleur thème unique à choisir",',
        "  \"messageEquipe\": \"1-2 phrases pour l'equipe d'animation\",",
        '  "enfantsDejaFaitTout": []',
        "}",
      ].join("\n");

      const message = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch {
        parsed = { themeSuggere: "Erreur analyse", messageEquipe: raw, themesRecommandes: [], enfantsDejaFaitTout: [] };
      }

      return NextResponse.json({
        success: true,
        suggestion: parsed,
        analyseParEnfant,
        themesRankes,
      });
    }

  } catch (error: any) {
    console.error("IA API error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
