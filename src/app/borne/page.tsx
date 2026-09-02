"use client";

/**
 * Borne d'accueil — V2 conversation naturelle (OpenAI Realtime, WebRTC).
 *
 * Plus de pipeline micro → transcription → IA → TTS : la voix part et
 * revient en continu via WebRTC (~500 ms de latence), le visiteur peut
 * couper la parole à l'assistant, et la détection de fin de phrase est
 * sémantique (le modèle attend que la phrase soit finie, pas juste un
 * silence — important avec les enfants qui hésitent).
 *
 * Sécurité inchangée par rapport à la V1 :
 * - La clé OpenAI ne quitte jamais le serveur : le navigateur reçoit un
 *   client secret éphémère créé par /api/borne/session (instructions et
 *   outils verrouillés côté serveur).
 * - LECTURE SEULE : l'unique outil (chercher_creneaux) est exécuté par le
 *   navigateur via /api/borne/creneaux, route authentifiée (token Firebase
 *   de la tablette) et limitée en débit. Aucune écriture en base.
 * - Coûts maîtrisés : fin automatique après inactivité, durée max par
 *   conversation, rate limit sur la création de sessions.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, PhoneOff, Loader2, Smartphone, X } from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import BorneVisage, { type BorneVisageHandle, type EtatVisage } from "@/components/BorneVisage";
import type { CarteCreneauBorne } from "@/lib/borne-creneaux";

type Etat = EtatVisage;

const INACTIVITE_MS = 90_000; // fin auto après 90 s sans parole
const DUREE_MAX_MS = 6 * 60_000; // durée max d'une conversation
// Au-delà de ce délai passé en "thinking", on considère que la réponse ne
// viendra jamais et on rend la main au visiteur (voir le watchdog).
const REFLEXION_MAX_MS = 15_000;
// Un appel d'outil qui ne répond pas fige la conversation : on l'abandonne
// et on renvoie une erreur au modèle, qui saura quoi dire.
const OUTIL_TIMEOUT_MS = 8_000;
// Les cartes de créneaux restent affichées après la fin de la conversation :
// le visiteur scanne son code QR tranquillement. Elles s'effacent ensuite.
const CARTES_DUREE_MS = 3 * 60_000;

// ── Cartes de créneaux : libellés ───────────────────────────────────────────
function jourCourt(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
}
function periodeCarte(c: CarteCreneauBorne) {
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", o);
  if (c.nbJours > 1 && c.dateFin && c.dateFin > c.date) {
    return `Du ${fmt(c.date, { weekday: "short", day: "numeric" })} au ${fmt(c.dateFin, { weekday: "short", day: "numeric", month: "long" })} · ${c.nbJours} jours`;
  }
  return fmt(c.date, { weekday: "long", day: "numeric", month: "long" });
}
function prixCarte(c: CarteCreneauBorne) {
  if (c.priceTTC == null) return "Prix à l’accueil";
  const semaine = `${c.priceTTC.toFixed(2).replace(".", ",")} €`;
  return c.priceTTCDay ? `${semaine} · journée ${c.priceTTCDay.toFixed(2).replace(".", ",")} €` : semaine;
}

// ── Erreurs de démarrage, en clair ──────────────────────────────────────────
// La borne affichait le message brut du navigateur (« Permission denied »,
// « Failed to fetch »…) : impossible, depuis l'accueil, de savoir s'il
// fallait autoriser le micro, reconnecter la tablette ou appeler le support.
function messageErreurDemarrage(e: any): string {
  const nom = String(e?.name || "");
  const msg = String(e?.message || "");
  if (nom === "NotAllowedError" || nom === "SecurityError" || /permission denied|not allowed/i.test(msg)) {
    return "Micro refusé par la tablette. Autorisez le microphone pour ce site (réglages du navigateur ou de l’application), puis réessayez.";
  }
  if (nom === "NotFoundError" || nom === "OverconstrainedError") {
    return "Aucun microphone détecté sur cette tablette.";
  }
  if (nom === "NotReadableError") {
    return "Le microphone est déjà utilisé par une autre application. Fermez-la puis réessayez.";
  }
  if (/non authentifi/i.test(msg)) {
    return "La tablette n’est plus connectée au compte du club. Reconnectez-vous depuis l’espace cavalier, puis revenez ici.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Pas de connexion Internet, ou serveur injoignable. Vérifiez le Wi-Fi de la tablette.";
  }
  return msg || "Impossible de démarrer la conversation.";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BornePage() {
  const { user, loading: authLoading } = useAuth();

  const [etat, setEtat] = useState<Etat>("off");
  const [sousTitre, setSousTitre] = useState("");
  const [erreur, setErreur] = useState("");
  // Créneaux trouvés par Câlin, affichés en cartes ; un code QR par carte
  // emmène le visiteur sur ce créneau depuis SON téléphone. La tablette ne
  // quitte jamais le compte du club.
  const [cartes, setCartes] = useState<CarteCreneauBorne[]>([]);
  const [qrPour, setQrPour] = useState<CarteCreneauBorne | null>(null);
  const [qrImage, setQrImage] = useState("");
  const cartesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const programmerEffacementCartes = () => {
    if (cartesTimerRef.current) clearTimeout(cartesTimerRef.current);
    cartesTimerRef.current = setTimeout(() => { setCartes([]); setQrPour(null); }, CARTES_DUREE_MS);
  };
  const ouvrirQr = async (c: CarteCreneauBorne) => {
    programmerEffacementCartes();
    setQrPour(c);
    setQrImage("");
    try {
      const url = `${window.location.origin}/espace-cavalier/reserver?creneau=${encodeURIComponent(c.id)}`;
      setQrImage(await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 320, color: { dark: "#0C1A2E", light: "#ffffff" } }));
    } catch (e) {
      console.error("[Borne] QR impossible :", e);
    }
  };

  // Objets mutables en useRef (contrainte Safari/iOS : jamais en useState)
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTraiteRef = useRef<MediaStream | null>(null);
  // Élément <audio> PERSISTANT rendu dans le JSX (playsInline requis iOS).
  // Il reste muet : il ne sert qu'à faire circuler le flux WebRTC (bizarrerie
  // Chrome — sans élément média attaché, un flux distant ne produit rien
  // dans Web Audio). Le SON sort par l'AudioContext, créé et débloqué
  // PENDANT l'appui sur le bouton — c'est ce qui rend la voix audible sur
  // mobile, où un play() différé hors geste utilisateur est bloqué.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const visageRef = useRef<BorneVisageHandle | null>(null);
  const etatRef = useRef<Etat>("off");
  etatRef.current = etat;
  const inactiviteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dureeMaxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef("");
  // Sous-titres cadencés : le modèle génère son texte bien avant de le
  // prononcer — on le dévoile progressivement au rythme de la parole
  // (~17 caractères/s) au lieu de l'afficher d'un bloc
  const sousTitreCibleRef = useRef("");
  const sousTitreAffRef = useRef(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const humeurEnAttenteRef = useRef<"clin" | "desole" | "joie" | null>(null);
  const accueilFaitRef = useRef(false);
  const repriseMicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Filet de sécurité de l'état "thinking" — voir le useEffect plus bas
  const reflexionWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nettoyage complet au démontage
  useEffect(() => () => { raccrocherInterne(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Préchauffage des fonctions serverless dès l'affichage : le démarrage
  // à froid Vercel (1-3 s) est payé maintenant, pas quand le visiteur
  // appuie sur le bouton
  useEffect(() => {
    fetch("/api/borne/session").catch(() => {});
    fetch("/api/borne/creneaux").catch(() => {});
  }, []);

  // ── Filet de sécurité : ne jamais rester bloqué en réflexion ──────────────
  // "thinking" n'a AUCUNE sortie garantie : on y entre quand le visiteur
  // arrête de parler et quand le modèle demande un outil, mais on n'en sort
  // que si de l'audio finit par arriver. Si la réponse échoue, si un appel
  // d'outil n'aboutit pas, ou si le modèle ne produit rien, la borne reste
  // sur « Un instant, je cherche… » indéfiniment — le visiteur doit reparler
  // pour la débloquer. Ce watchdog couvre tous ces cas d'un coup.
  useEffect(() => {
    if (etat !== "thinking") {
      if (reflexionWatchdogRef.current) {
        clearTimeout(reflexionWatchdogRef.current);
        reflexionWatchdogRef.current = null;
      }
      return;
    }
    reflexionWatchdogRef.current = setTimeout(() => {
      if (etatRef.current !== "thinking") return;
      console.warn("[Borne] réflexion bloquée — retour à l'écoute");
      // Le micro a pu être coupé par la garde anti-écho : on le rouvre.
      if (repriseMicTimerRef.current) {
        clearTimeout(repriseMicTimerRef.current);
        repriseMicTimerRef.current = null;
      }
      micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
      micTraiteRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
      if (dcRef.current?.readyState === "open") {
        dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
      }
      setSousTitre("Désolé, je n'ai pas réussi à répondre. Vous pouvez répéter ?");
      setEtat("idle");
      relancerInactivite();
    }, REFLEXION_MAX_MS);
    return () => {
      if (reflexionWatchdogRef.current) {
        clearTimeout(reflexionWatchdogRef.current);
        reflexionWatchdogRef.current = null;
      }
    };
  }, [etat]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fin de conversation ─────────────────────────────────────────────────────
  const raccrocherInterne = () => {
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    if (repriseMicTimerRef.current) { clearTimeout(repriseMicTimerRef.current); repriseMicTimerRef.current = null; }
    if (reflexionWatchdogRef.current) { clearTimeout(reflexionWatchdogRef.current); reflexionWatchdogRef.current = null; }
    if (inactiviteRef.current) clearTimeout(inactiviteRef.current);
    if (dureeMaxRef.current) clearTimeout(dureeMaxRef.current);
    cancelAnimationFrame(rafRef.current);
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micTraiteRef.current?.getTracks().forEach((t) => t.stop());
    micTraiteRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
      audioElRef.current.muted = true; // re-muet pour la prochaine session
    }
    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
    analyserRef.current = null;
  };

  const raccrocher = useCallback(() => {
    raccrocherInterne();
    accueilFaitRef.current = false;
    setEtat("off");
    setSousTitre("");
  }, []);

  // Minuteur d'inactivité : borne publique, on ne laisse pas une session
  // Realtime (facturée à la minute) tourner devant un hall vide
  const relancerInactivite = () => {
    if (inactiviteRef.current) clearTimeout(inactiviteRef.current);
    inactiviteRef.current = setTimeout(() => raccrocher(), INACTIVITE_MS);
  };

  // ── Outil chercher_creneaux (exécuté côté client, route authentifiée) ──────
  const executerOutil = async (name: string, callId: string, argsJson: string) => {
    let output = "Erreur technique.";
    // Sans limite de temps, une route qui ne répond pas (démarrage à froid,
    // réseau du club-house) laissait la borne figée sur « je cherche… ».
    const avecTimeout = (url: string, body: string) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), OUTIL_TIMEOUT_MS);
      return authFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
    };
    if (name === "laisser_message") {
      try {
        const args = argsJson ? JSON.parse(argsJson) : {};
        const res = await avecTimeout("/api/borne/message", JSON.stringify(args));
        const data = await res.json();
        output = data.ok
          ? "Message enregistré et transmis à l'équipe."
          : `Échec de l'envoi (${data.error || "erreur inconnue"}) — proposer de passer à l'accueil.`;
        if (data.ok) humeurEnAttenteRef.current = "clin";
      } catch {
        output = "Échec technique de l'envoi — proposer de passer à l'accueil.";
      }
    } else if (name === "chercher_creneaux") {
      try {
        const args = argsJson ? JSON.parse(argsJson) : {};
        const res = await avecTimeout("/api/borne/creneaux", JSON.stringify(args));
        const data = await res.json();
        output = data.result || "Aucun résultat.";
        // Ce que Câlin va annoncer s'affiche en même temps à l'écran.
        const trouvees: CarteCreneauBorne[] = Array.isArray(data.creneaux) ? data.creneaux : [];
        setCartes(trouvees);
        setQrPour(null);
        if (trouvees.length > 0) programmerEffacementCartes();
      } catch {
        output = "Erreur technique lors de la consultation du planning.";
      }
    } else {
      output = `Outil inconnu : ${name}`;
    }
    // Renvoyer le résultat au modèle puis lui demander de répondre
    const dc = dcRef.current;
    if (dc?.readyState === "open") {
      dc.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output },
      }));
      dc.send(JSON.stringify({ type: "response.create" }));
    }
  };

  // ── Événements du data channel ──────────────────────────────────────────────
  const surEvenement = (raw: string) => {
    let ev: any;
    try { ev = JSON.parse(raw); } catch { return; }

    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        setEtat("listening");
        setSousTitre("");
        relancerInactivite();
        break;
      case "input_audio_buffer.speech_stopped":
        setEtat("thinking");
        break;
      case "response.created":
        transcriptRef.current = "";
        sousTitreCibleRef.current = "";
        sousTitreAffRef.current = 0;
        setSousTitre("");
        break;
      case "output_audio_buffer.started":
        setEtat("speaking");
        relancerInactivite();
        // Micro coupé pendant que le poney parle : dans un club-house
        // bruyant, le laisser ouvert transformait le brouhaha (et l'écho
        // de sa propre voix) en fausses prises de parole
        if (repriseMicTimerRef.current) { clearTimeout(repriseMicTimerRef.current); repriseMicTimerRef.current = null; }
        micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
        micTraiteRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        // Garde anti-écho : la fin de la phrase du poney résonne encore
        // dans la pièce quand l'audio "se termine" côté flux — rouvrir le
        // micro immédiatement lui faisait entendre sa propre voix, qu'il
        // prenait pour une prise de parole (d'où les relances « que
        // souhaitez-vous ? » avant même que le visiteur ne parle)
        if (repriseMicTimerRef.current) clearTimeout(repriseMicTimerRef.current);
        repriseMicTimerRef.current = setTimeout(() => {
          micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
          micTraiteRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
          // Purge de ce qui aurait pu être capté entre-temps
          if (dcRef.current?.readyState === "open") {
            dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          }
        }, 600);
        if (etatRef.current === "speaking") setEtat("idle");
        sousTitreAffRef.current = sousTitreCibleRef.current.length;
        setSousTitre(sousTitreCibleRef.current);
        // Expression de fin de réponse : clin d'œil après un message transmis,
        // air désolé après un refus, sourire enthousiaste sinon si le ton y est
        {
          const texte = transcriptRef.current.toLowerCase();
          let humeur = humeurEnAttenteRef.current;
          humeurEnAttenteRef.current = null;
          if (!humeur && /(désolé|desole|malheureusement|pas possible|ne peux pas|n'est pas possible)/.test(texte)) humeur = "desole";
          if (!humeur && /(bienvenue|avec plaisir|à bientôt|super|génial|bonne journée)/.test(texte)) humeur = "joie";
          if (humeur) {
            const h = humeur;
            // Laisser l'état repasser à idle avant d'afficher l'expression
            setTimeout(() => visageRef.current?.setHumeur?.(h, 2000), 60);
          }
        }
        break;
      // Transcript de la réponse — noms d'événements beta et GA gérés
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        transcriptRef.current += ev.delta || "";
        sousTitreCibleRef.current = transcriptRef.current;
        break;
      case "response.done": {
        // Appels d'outils demandés par le modèle
        const outputs = ev.response?.output;
        if (Array.isArray(outputs)) {
          const appels = outputs.filter((o: any) => o?.type === "function_call" && o.call_id);
          if (appels.length > 0) setEtat("thinking"); // il cherche — rester en réflexion
          for (const item of appels) {
            executerOutil(item.name, item.call_id, item.arguments || "{}");
          }
          // Réponse en échec ou annulée sans outil à exécuter : aucun audio
          // n'arrivera, donc rien ne nous ferait quitter "thinking".
          const statut = ev.response?.status;
          if (appels.length === 0 && (statut === "failed" || statut === "cancelled")) {
            if (etatRef.current === "thinking") setEtat("idle");
          }
        }
        break;
      }
      case "error":
        console.error("[Borne Realtime] erreur:", ev.error);
        if (etatRef.current === "thinking") setEtat("idle");
        break;
    }
  };

  // Interruption à l'écran : on coupe la réponse en cours et on rouvre
  // le micro — remplace l'interruption à la voix, désactivée car le bruit
  // ambiant coupait les réponses en plein milieu
  const interrompreReponse = useCallback(() => {
    const dc = dcRef.current;
    if (etatRef.current !== "speaking" || dc?.readyState !== "open") return;
    dc.send(JSON.stringify({ type: "response.cancel" }));
    dc.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
    if (repriseMicTimerRef.current) { clearTimeout(repriseMicTimerRef.current); repriseMicTimerRef.current = null; }
    micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
    micTraiteRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
    dc.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    setEtat("idle");
  }, []);

  // ── Démarrage de la conversation (WebRTC) ───────────────────────────────────
  const demarrer = async () => {
    setErreur("");
    setEtat("connecting");
    setCartes([]);
    setQrPour(null);
    if (cartesTimerRef.current) { clearTimeout(cartesTimerRef.current); cartesTimerRef.current = null; }
    try {
      // AudioContext créé sur le geste utilisateur (contrainte Safari)
      if (!audioCtxRef.current) {
        try {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch { /* bouche en oscillation de secours */ }
      }
      audioCtxRef.current?.resume().catch(() => {});

      // 1+2. Micro et session éphémère EN PARALLÈLE : les deux prennent
      // chacun 0,5 à 2 s, les enchaîner doublait l'attente pour rien.
      // Contraintes explicites : autoGainControl remonte les voix faibles,
      // les valeurs par défaut varient selon les navigateurs.
      const [mic, sRes] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        authFetch("/api/borne/session", { method: "POST" }),
      ]);
      micStreamRef.current = mic;

      // Compresseur + gain entre le micro et l'envoi : remonte les petites
      // voix (enfants, personnes timides) sans faire saturer les fortes —
      // le même principe que le traitement voix d'une radio. Si Web Audio
      // est indisponible, on envoie le micro brut.
      let pisteEnvoyee = mic.getAudioTracks()[0];
      let fluxEnvoye: MediaStream = mic;
      if (audioCtxRef.current) {
        try {
          const ctx = audioCtxRef.current;
          const source = ctx.createMediaStreamSource(mic);
          const compresseur = ctx.createDynamicsCompressor();
          compresseur.threshold.value = -35; // agit dès les niveaux faibles
          compresseur.knee.value = 20;
          compresseur.ratio.value = 6;
          compresseur.attack.value = 0.01;
          compresseur.release.value = 0.2;
          const gain = ctx.createGain();
          gain.gain.value = 1.6;
          const sortie = ctx.createMediaStreamDestination();
          source.connect(compresseur);
          compresseur.connect(gain);
          gain.connect(sortie);
          micTraiteRef.current = sortie.stream;
          pisteEnvoyee = sortie.stream.getAudioTracks()[0];
          fluxEnvoye = sortie.stream;
        } catch { micTraiteRef.current = null; }
      }

      if (sRes.status === 429) throw new Error("Trop de conversations d'un coup — patientez une minute.");
      const sData = await sRes.json();
      if (!sData.clientSecret) throw new Error(sData.error || "Session vocale indisponible");

      // 3. Connexion WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Audio sortant du modèle → lecteur + analyseur pour la bouche
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        const audio = audioElRef.current;
        if (audio) {
          audio.srcObject = stream;
          audio.play().catch(() => {});
        }
        if (audioCtxRef.current) {
          try {
            const src = audioCtxRef.current.createMediaStreamSource(stream);
            const analyser = audioCtxRef.current.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            // Le son sort ICI (AudioContext débloqué par le geste), pas par
            // l'élément <audio> qui reste muet et ne fait que pomper le flux
            analyser.connect(audioCtxRef.current.destination);
            analyserRef.current = analyser;
          } catch {
            analyserRef.current = null;
            // Sans Web Audio : l'élément <audio> devient la sortie sonore
            if (audio) audio.muted = false;
          }
        } else if (audio) {
          audio.muted = false;
        }
      };

      pc.addTrack(pisteEnvoyee, fluxEnvoye);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => surEvenement(e.data);
      dc.onopen = () => {
        setEtat("idle");
        relancerInactivite();
        // Cadenceur des sous-titres : ~1 caractère toutes les 60 ms
        // (≈ débit de parole), rattrapage accéléré si gros retard
        if (tickerRef.current) clearInterval(tickerRef.current);
        tickerRef.current = setInterval(() => {
          const cible = sousTitreCibleRef.current;
          if (sousTitreAffRef.current < cible.length) {
            const retard = cible.length - sousTitreAffRef.current;
            sousTitreAffRef.current += retard > 140 ? 3 : 1;
            setSousTitre(cible.slice(0, sousTitreAffRef.current));
          }
        }, 60);
        // Message d'accueil dès la connexion — UNE SEULE phrase, une seule fois
        if (!accueilFaitRef.current) {
          accueilFaitRef.current = true;
          dc.send(JSON.stringify({
            type: "response.create",
            response: { instructions: "Salue le visiteur en UNE SEULE phrase courte et chaleureuse (quinze mots maximum, question incluse), puis tais-toi et attends. N'enchaîne aucune deuxième phrase." },
          }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState) && etatRef.current !== "off") {
          raccrocher();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls?model=gpt-realtime", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sData.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpRes.ok) throw new Error("Connexion vocale refusée");
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Boucle d'animation de la bouche — pilotée par l'amplitude réelle
      const animer = () => {
        if (etatRef.current === "off") return;
        if (etatRef.current === "speaking") {
          let ouverture: number; // 0..1
          const analyser = analyserRef.current;
          if (analyser) {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            let somme = 0;
            for (let i = 0; i < data.length; i++) somme += data[i];
            ouverture = somme / data.length / 255;
          } else {
            ouverture = 0.1 + Math.abs(Math.sin(performance.now() / 90)) * 0.4;
          }
          visageRef.current?.setBouche(ouverture);
        }
        rafRef.current = requestAnimationFrame(animer);
      };
      rafRef.current = requestAnimationFrame(animer);

      // Durée max de conversation : garde-fou coût
      dureeMaxRef.current = setTimeout(() => raccrocher(), DUREE_MAX_MS);
    } catch (e: any) {
      raccrocherInterne();
      setEtat("off");
      setErreur(messageErreurDemarrage(e));
      console.error("[Borne] démarrage impossible :", e?.name, e?.message, e);
    }
  };

  // ── Garde : la tablette doit être connectée ────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="font-display text-2xl font-bold text-blue-800 mb-3">Borne non connectée</h1>
          <p className="font-body text-sm text-gray-500 mb-6">
            Connectez cette tablette avec le compte du club pour activer l&apos;assistant d&apos;accueil.
          </p>
          <a href="/espace-cavalier" className="inline-block px-6 py-3 rounded-xl bg-blue-500 text-white font-body text-sm font-semibold no-underline">
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  // ── Écran principal ─────────────────────────────────────────────────────────
  const enConversation = etat !== "off" && etat !== "connecting";
  const statusTexte =
    etat === "connecting" ? "Câlin se réveille…"
    : etat === "listening" ? "Je vous écoute… parlez !"
    : etat === "thinking" ? "Un instant, je cherche…"
    : etat === "speaking" ? "Touchez-moi pour m'interrompre"
    : enConversation ? "À vous ! Posez-moi votre question"
    : "Bonjour ! Appuyez sur le bouton pour discuter avec moi";
  // Pastille d'état : vert = à vous de parler, orange = il travaille,
  // bleu = il parle — lisible d'un coup d'œil même sans lire le texte
  const pastille =
    etat === "listening" || (enConversation && etat === "idle") ? "bg-green-500"
    : etat === "thinking" || etat === "connecting" ? "bg-amber-400"
    : etat === "speaking" ? "bg-blue-500"
    : null;

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-sky-100 via-cream to-green-100 flex flex-col items-center justify-between py-8 px-6 select-none overflow-hidden">
      {/* Décor : soleil et bulles pastel floutées (pur CSS, aucun coût) */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full bg-amber-200/60 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -left-24 w-80 h-80 rounded-full bg-sky-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 w-96 h-96 rounded-full bg-green-200/50 blur-3xl" />
      {/* Sortie audio persistante — voir audioElRef */}
      <audio ref={audioElRef} autoPlay playsInline muted className="hidden" />

      {/* En-tête */}
      <header className="text-center">
        <h1 className="font-calligraphie text-4xl md:text-6xl font-bold text-blue-800 leading-tight">Centre Équestre d&apos;Agon-Coutainville</h1>
        <p className="inline-flex items-center gap-1.5 font-body text-base font-semibold text-amber-800 bg-white/70 rounded-full px-4 py-1.5 mt-2 shadow-sm">
          🐴 Câlin, votre assistant d&apos;accueil
        </p>
      </header>

      {/* Visage — plus petit quand des créneaux sont affichés dessous */}
      <div className={`relative my-2 transition-all ${cartes.length > 0 ? "w-48 h-48 md:w-60 md:h-60" : "w-80 h-80 md:w-[26rem] md:h-[26rem]"}`} onClick={interrompreReponse}
        role={etat === "speaking" ? "button" : undefined}>
        {etat === "listening" && (
          <span className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-40" />
        )}
        <BorneVisage ref={visageRef} etat={etat} />
      </div>

      {/* Sous-titres */}
      <div className="w-full max-w-2xl text-center min-h-[120px] flex flex-col items-center gap-3">
        {statusTexte && (
          <div className="inline-flex items-center gap-2.5 mx-auto">
            {pastille && <span className={`w-5 h-5 rounded-full flex-shrink-0 ${pastille} ${etat === "thinking" || etat === "connecting" ? "animate-pulse" : ""}`} />}
            <p className="font-body text-2xl md:text-3xl font-bold text-blue-900">{statusTexte}</p>
          </div>
        )}
        {sousTitre && (
          <p className="font-body text-xl md:text-2xl text-slate-800 leading-relaxed bg-white/90 rounded-2xl px-7 py-5 shadow-sm max-h-52 overflow-y-auto">
            {sousTitre}
          </p>
        )}
        {enConversation && etat === "idle" && !sousTitre && (
          <p className="font-body text-lg text-gray-500">
            Essayez : « Il reste de la place aux prochains stages ? » — « Quels sont les tarifs ? »
          </p>
        )}
        {erreur && <p className="font-body text-sm text-red-500">{erreur}</p>}
      </div>

      {/* Créneaux trouvés : ce que Câlin annonce, le visiteur le voit et
          peut le réserver depuis son téléphone. */}
      {cartes.length > 0 && (
        <div className="w-full max-w-3xl">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="font-body text-sm font-bold uppercase tracking-wider text-blue-800">
              {cartes.length === 1 ? "Le créneau trouvé" : `${cartes.length} créneaux trouvés`}
            </div>
            <button type="button" onClick={() => { setCartes([]); setQrPour(null); }} className="font-body text-xs font-semibold text-gray-500 bg-white/70 border-none rounded-full px-3 py-1.5 cursor-pointer">
              Masquer
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[38vh] overflow-y-auto pr-1">
            {cartes.map((c) => {
              const complet = c.placesRestantes <= 0;
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-blue-500/10 p-3.5 flex items-center gap-3 text-left">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="font-body text-[11px] font-bold uppercase text-blue-500 leading-none">{jourCourt(c.date)}</span>
                    <span className="font-display text-lg font-bold text-blue-800 leading-tight">{new Date(`${c.date}T12:00:00`).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-base font-bold text-blue-800 truncate">{c.activityTitle}</div>
                    <div className="font-body text-sm text-gray-600 truncate">{periodeCarte(c)} · {c.startTime}–{c.endTime}</div>
                    <div className="font-body text-sm text-gray-600">
                      <span className="font-semibold text-blue-800">{prixCarte(c)}</span>
                      {" · "}
                      <span className={complet ? "text-red-600 font-semibold" : "text-green-700"}>
                        {complet ? "Complet — liste d’attente" : `${c.placesRestantes} place${c.placesRestantes > 1 ? "s" : ""}`}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={() => ouvrirQr(c)}
                    className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl bg-blue-500 text-white border-none cursor-pointer flex-shrink-0">
                    <Smartphone size={20} />
                    <span className="font-body text-[11px] font-bold leading-tight text-center">Réserver sur<br />mon téléphone</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Code QR : le visiteur scanne et arrive sur ce créneau, dans son
          propre espace, sur son propre téléphone. */}
      {qrPour && (
        <div className="fixed inset-0 z-50 bg-blue-900/70 flex items-center justify-center p-6" onClick={() => setQrPour(null)}>
          <div className="bg-white rounded-3xl p-7 max-w-md w-full text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl font-bold text-blue-800">{qrPour.activityTitle}</div>
            <div className="font-body text-base text-gray-600 mt-1">{periodeCarte(qrPour)} · {qrPour.startTime}–{qrPour.endTime}</div>
            <div className="my-5 flex items-center justify-center min-h-[320px]">
              {qrImage
                ? <img src={qrImage} alt="Code QR vers ce créneau" width={320} height={320} className="rounded-xl" />
                : <Loader2 size={36} className="animate-spin text-blue-500" />}
            </div>
            <p className="font-body text-lg font-semibold text-blue-900 leading-snug">
              Scannez ce code avec l’appareil photo de votre téléphone.
            </p>
            <p className="font-body text-sm text-gray-600 mt-2 leading-relaxed">
              Vous arrivez directement sur ce créneau dans votre espace cavalier, pour réserver et régler par carte.
              Pas encore de compte ? Il se crée en une minute, au même endroit.
            </p>
            <button type="button" onClick={() => setQrPour(null)}
              className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-50 text-blue-800 font-body text-sm font-bold border-none cursor-pointer">
              <X size={16} /> Fermer
            </button>
          </div>
        </div>
      )}

      {/* Bouton principal */}
      <div className="flex flex-col items-center gap-3 pb-2">
        {etat === "off" ? (
          <button type="button" onClick={demarrer}
            className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-sky-400 hover:scale-105 flex items-center justify-center border-none cursor-pointer shadow-2xl transition-transform">
            <Mic size={44} className="text-white" />
          </button>
        ) : etat === "connecting" ? (
          <div className="w-28 h-28 rounded-full bg-blue-500/60 flex items-center justify-center shadow-2xl">
            <Loader2 size={40} className="text-white animate-spin" />
          </div>
        ) : (
          <button type="button" onClick={raccrocher}
            className="w-28 h-28 rounded-full bg-gradient-to-br from-red-500 to-rose-400 hover:scale-105 flex items-center justify-center border-none cursor-pointer shadow-2xl transition-transform">
            <PhoneOff size={36} className="text-white" />
          </button>
        )}
        <p className="font-body text-base font-semibold text-gray-500">
          {etat === "off" ? "Appuyez pour discuter" : etat === "connecting" ? "Un instant…" : "Appuyez pour terminer la conversation"}
        </p>
      </div>
    </div>
  );
}
