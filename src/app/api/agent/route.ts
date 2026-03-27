import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Outils disponibles ────────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "creer_creneaux",
    description: "Crée un ou plusieurs créneaux dans le planning. Utilise cet outil quand l'utilisateur demande de créer, ajouter ou planifier des séances, cours, balades ou stages.",
    input_schema: {
      type: "object" as const,
      properties: {
        creneaux: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "Date YYYY-MM-DD" },
              startTime: { type: "string", description: "Heure début HH:MM" },
              endTime: { type: "string", description: "Heure fin HH:MM" },
              activityTitle: { type: "string" },
              activityType: { type: "string", enum: ["cours","stage","stage_journee","balade","competition","anniversaire"] },
              monitor: { type: "string" },
              maxPlaces: { type: "number" },
              priceTTC: { type: "number" },
            },
            required: ["date","startTime","endTime","activityTitle","activityType"],
          },
        },
      },
      required: ["creneaux"],
    },
  },
  {
    name: "inscrire_enfant",
    description: "Inscrit un enfant dans un créneau existant.",
    input_schema: {
      type: "object" as const,
      properties: {
        creneauId: { type: "string", description: "ID du créneau Firestore" },
        childId: { type: "string" },
        childName: { type: "string" },
        familyId: { type: "string" },
        familyName: { type: "string" },
      },
      required: ["creneauId","childId","childName","familyId","familyName"],
    },
  },
  {
    name: "desinscrire_enfant",
    description: "Désinscrit un enfant d'un créneau.",
    input_schema: {
      type: "object" as const,
      properties: {
        creneauId: { type: "string" },
        childId: { type: "string" },
        childName: { type: "string" },
      },
      required: ["creneauId","childId","childName"],
    },
  },
  {
    name: "consulter_impayes",
    description: "Consulte les paiements en attente d'une famille ou de toutes les familles.",
    input_schema: {
      type: "object" as const,
      properties: {
        familyName: { type: "string", description: "Nom de la famille (optionnel — si vide, retourne tous les impayés)" },
      },
    },
  },
  {
    name: "modifier_tarif",
    description: "Modifie le prix TTC d'une activité.",
    input_schema: {
      type: "object" as const,
      properties: {
        activityTitle: { type: "string", description: "Nom de l'activité à modifier" },
        nouveauPrixTTC: { type: "number", description: "Nouveau prix TTC en euros" },
      },
      required: ["activityTitle","nouveauPrixTTC"],
    },
  },
  {
    name: "cloturer_reprise",
    description: "Clôture une reprise (créneau) du jour.",
    input_schema: {
      type: "object" as const,
      properties: {
        creneauId: { type: "string", description: "ID du créneau à clôturer" },
        creneauTitle: { type: "string", description: "Titre du créneau pour confirmation" },
      },
      required: ["creneauId","creneauTitle"],
    },
  },
  {
    name: "envoyer_email",
    description: "Envoie un email à une famille.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Adresse email destinataire" },
        familyName: { type: "string" },
        subject: { type: "string" },
        message: { type: "string", description: "Corps du message en texte simple" },
      },
      required: ["to","subject","message"],
    },
  },
];

// ── Exécution des outils ──────────────────────────────────────────────────────

async function executeTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {

      case "creer_creneaux": {
        const created: string[] = [];
        for (const c of input.creneaux) {
          const ref = await adminDb.collection("creneaux").add({
            activityTitle: c.activityTitle,
            activityType: c.activityType,
            date: c.date,
            startTime: c.startTime,
            endTime: c.endTime,
            monitor: c.monitor || "",
            maxPlaces: c.maxPlaces || 8,
            priceTTC: c.priceTTC || 0,
            priceHT: c.priceTTC ? c.priceTTC / 1.055 : 0,
            tvaTaux: 5.5,
            enrolled: [],
            enrolledCount: 0,
            status: "planned",
            createdAt: FieldValue.serverTimestamp(),
            createdByAgent: true,
          });
          const d = new Date(c.date);
          const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          created.push(`${label} ${c.startTime}–${c.endTime} (${ref.id.slice(-4)})`);
        }
        return `✅ ${created.length} créneau${created.length > 1 ? "x" : ""} créé${created.length > 1 ? "s" : ""} : ${created.join(", ")}`;
      }

      case "inscrire_enfant": {
        const snap = await adminDb.collection("creneaux").doc(input.creneauId).get();
        if (!snap.exists) return "❌ Créneau introuvable";
        const data = snap.data()!;
        const enrolled = data.enrolled || [];
        if (enrolled.some((e: any) => e.childId === input.childId)) {
          return `⚠️ ${input.childName} est déjà inscrit dans ce créneau`;
        }
        // Inscrire dans le créneau
        await adminDb.collection("creneaux").doc(input.creneauId).update({
          enrolled: FieldValue.arrayUnion({
            childId: input.childId,
            childName: input.childName,
            familyId: input.familyId,
            familyName: input.familyName,
            enrolledAt: new Date().toISOString(),
            presence: null,
          }),
          enrolledCount: FieldValue.increment(1),
        });
        // Créer le paiement pending si prix > 0
        const priceTTC = data.priceTTC || 0;
        if (priceTTC > 0) {
          await adminDb.collection("payments").add({
            familyId: input.familyId,
            familyName: input.familyName,
            items: [{
              activityTitle: data.activityTitle,
              activityType: data.activityType,
              childId: input.childId,
              childName: input.childName,
              creneauId: input.creneauId,
              priceHT: priceTTC / 1.055,
              tva: 5.5,
              priceTTC,
            }],
            totalTTC: priceTTC,
            paidAmount: 0,
            status: "pending",
            paymentMode: "",
            paymentRef: "",
            source: "agent",
            date: FieldValue.serverTimestamp(),
          });
          return `✅ ${input.childName} inscrit dans "${data.activityTitle}" le ${data.date} — Paiement de ${priceTTC.toFixed(2)}€ créé en attente`;
        }
        return `✅ ${input.childName} inscrit dans "${data.activityTitle}" le ${data.date}`;
      }

      case "desinscrire_enfant": {
        const snap = await adminDb.collection("creneaux").doc(input.creneauId).get();
        if (!snap.exists) return "❌ Créneau introuvable";
        const data = snap.data()!;
        const enrolled = (data.enrolled || []).filter((e: any) => e.childId !== input.childId);
        await adminDb.collection("creneaux").doc(input.creneauId).update({
          enrolled,
          enrolledCount: enrolled.length,
        });
        return `✅ ${input.childName} désinscrit de "${data.activityTitle}"`;
      }

      case "consulter_impayes": {
        let q = adminDb.collection("payments").where("status", "==", "pending");
        const snap = await q.get();
        const impayes = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        const filtered = input.familyName
          ? impayes.filter(p => p.familyName?.toLowerCase().includes(input.familyName.toLowerCase()))
          : impayes;
        if (filtered.length === 0) return input.familyName
          ? `Aucun impayé pour la famille ${input.familyName}`
          : "Aucun impayé en cours";
        const total = filtered.reduce((s: number, p: any) => s + (p.totalTTC || 0), 0);
        const details = filtered.slice(0, 5).map((p: any) =>
          `${p.familyName} : ${(p.totalTTC || 0).toFixed(2)}€ (${(p.items || []).map((i: any) => i.activityTitle).join(", ")})`
        ).join(" | ");
        return `${filtered.length} impayé${filtered.length > 1 ? "s" : ""} — Total ${total.toFixed(2)}€ — ${details}`;
      }

      case "modifier_tarif": {
        const snap = await adminDb.collection("activities")
          .where("title", "==", input.activityTitle).limit(1).get();
        if (snap.empty) {
          // Cherche en partiel
          const allSnap = await adminDb.collection("activities").get();
          const match = allSnap.docs.find(d =>
            d.data().title?.toLowerCase().includes(input.activityTitle.toLowerCase())
          );
          if (!match) return `❌ Activité "${input.activityTitle}" introuvable`;
          const tvaTaux = match.data().tvaTaux || 5.5;
          const priceHT = input.nouveauPrixTTC / (1 + tvaTaux / 100);
          await match.ref.update({
            priceTTC: input.nouveauPrixTTC,
            priceHT: Math.round(priceHT * 100) / 100,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return `✅ Tarif "${match.data().title}" mis à jour : ${input.nouveauPrixTTC}€ TTC`;
        }
        const doc = snap.docs[0];
        const tvaTaux = doc.data().tvaTaux || 5.5;
        await doc.ref.update({
          priceTTC: input.nouveauPrixTTC,
          priceHT: Math.round(input.nouveauPrixTTC / (1 + tvaTaux / 100) * 100) / 100,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return `✅ Tarif "${input.activityTitle}" mis à jour : ${input.nouveauPrixTTC}€ TTC`;
      }

      case "cloturer_reprise": {
        await adminDb.collection("creneaux").doc(input.creneauId).update({
          status: "closed",
          closedAt: FieldValue.serverTimestamp(),
          closedByAgent: true,
        });
        return `✅ Reprise "${input.creneauTitle}" clôturée`;
      }

      case "envoyer_email": {
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) return "❌ Resend non configuré";
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
            to: input.to,
            subject: input.subject,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
              ${input.familyName ? `<p>Bonjour <strong>${input.familyName}</strong>,</p>` : ""}
              <p>${input.message.replace(/\n/g, "<br>")}</p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
              <p style="color:#999;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville</p>
            </div>`,
          }),
        });
        if (!res.ok) return `❌ Erreur envoi email (${res.status})`;
        return `✅ Email envoyé à ${input.to} — Objet : "${input.subject}"`;
      }

      default:
        return `❌ Outil inconnu : ${name}`;
    }
  } catch (e: any) {
    return `❌ Erreur : ${e.message}`;
  }
}

// ── Route principale ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { question, context, confirmed, pendingAction } = await req.json();

    // Si l'utilisateur doit confirmer une action, on l'exécute
    if (confirmed && pendingAction) {
      const result = await executeTool(pendingAction.tool, pendingAction.input);
      return NextResponse.json({ type: "result", message: result });
    }

    const systemPrompt = `Tu es l'agent IA de Nicolas, gérant du Centre Équestre d'Agon-Coutainville.
Tu peux AGIR directement sur le système grâce à tes outils.
Réponds en français, de façon concise — la réponse sera lue à voix haute.

DONNÉES ACTUELLES :
${JSON.stringify(context, null, 2)}

RÈGLES IMPORTANTES :
1. Pour toute action d'écriture (créer créneaux, inscrire, clôturer, modifier tarif, envoyer email), DEMANDE TOUJOURS CONFIRMATION. Résume en 1 phrase et termine par "Tu confirmes ?"
2. Pour les consultations (impayés, disponibilités), réponds directement sans confirmation.
3. Pour créer des créneaux récurrents, tu dois connaître la FRÉQUENCE exacte. Si la fréquence n'est pas précisée dans la demande (ex: "en juillet" sans préciser quel jour de la semaine), DEMANDE TOUJOURS avant de créer : "Quels jours de la semaine ?" Ne suppose jamais que c'est tous les jours.
4. Exemples de fréquences valides : "tous les mercredis", "les samedis et dimanches", "tous les jours en semaine". Si non précisé → demande.
5. Sois précis : "Je vais créer 4 créneaux Balade les mercredis de juillet, 14h-16h. Tu confirmes ?"
6. Texte simple, max 3 phrases, pas de markdown.`;

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: question },
    ];

    let response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    // Agentic loop — max 3 tours
    let loopCount = 0;
    while (response.stop_reason === "tool_use" && loopCount < 3) {
      loopCount++;
      const toolUses = response.content.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];

      // Si c'est une action qui nécessite confirmation, on retourne la demande de confirmation
      const actionTools = ["creer_creneaux","inscrire_enfant","desinscrire_enfant","modifier_tarif","cloturer_reprise","envoyer_email"];
      const actionTool = toolUses.find(t => actionTools.includes(t.name));

      if (actionTool && !confirmed) {
        // Générer un résumé de confirmation
        const confirmRes = await anthropic.messages.create({
          model: "claude-opus-4-5",
          max_tokens: 200,
          system: "Résume en 1 phrase courte et naturelle (en français) l'action qui va être effectuée, puis termine par 'Tu confirmes ?'. Pas de markdown.",
          messages: [{ role: "user", content: JSON.stringify({ tool: actionTool.name, input: actionTool.input }) }],
        });
        const confirmText = confirmRes.content[0].type === "text" ? confirmRes.content[0].text : "Tu confirmes cette action ?";
        return NextResponse.json({
          type: "confirm",
          message: confirmText,
          pendingAction: { tool: actionTool.name, input: actionTool.input },
        });
      }

      // Exécuter tous les outils
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const result = await executeTool(toolUse.name, toolUse.input);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 512,
        system: systemPrompt,
        tools,
        messages,
      });
    }

    const text = response.content.find(b => b.type === "text");
    return NextResponse.json({ type: "answer", message: text?.text || "Je n'ai pas pu répondre." });

  } catch (error: any) {
    console.error("Agent error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
