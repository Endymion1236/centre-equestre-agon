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
import { Mic, PhoneOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";

type Etat = "off" | "connecting" | "idle" | "listening" | "thinking" | "speaking";

const INACTIVITE_MS = 90_000; // fin auto après 90 s sans parole
const DUREE_MAX_MS = 6 * 60_000; // durée max d'une conversation

// ── Visage SVG animé ──────────────────────────────────────────────────────────

function Visage({ etat, blink, mouthRef }: {
  etat: Etat;
  blink: boolean;
  mouthRef: React.RefObject<SVGEllipseElement | null>;
}) {
  const ecoute = etat === "listening";
  const reflechit = etat === "thinking";
  // Pupilles : levées quand il réfléchit, grandes ouvertes quand il écoute
  const eyeCy = reflechit ? 88 : 94;
  const eyeRy = blink ? 1.5 : ecoute ? 12.5 : 10.5;
  const endormi = etat === "off" || etat === "connecting";

  return (
    <svg viewBox="0 0 240 240" className="w-full h-full" aria-hidden="true">
      <defs>
        <radialGradient id="borne-halo" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#DCE9FF" />
          <stop offset="100%" stopColor="#EEF4FF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="borne-robe" cx="42%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#FFEFD8" />
          <stop offset="70%" stopColor="#F6D9AC" />
          <stop offset="100%" stopColor="#EAC28C" />
        </radialGradient>
        <linearGradient id="borne-criniere" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A5713A" />
          <stop offset="100%" stopColor="#7A4E22" />
        </linearGradient>
        <radialGradient id="borne-museau" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFF7EA" />
          <stop offset="100%" stopColor="#F7E3C4" />
        </radialGradient>
        <style>{`
          .borne-tete { animation: borne-bob 4.2s ease-in-out infinite; transform-origin: 120px 130px; }
          .borne-oreille-g { transform-origin: 70px 58px; }
          .borne-oreille-d { transform-origin: 170px 58px; }
          .borne-ecoute .borne-oreille-g { animation: borne-twitch-g 1.6s ease-in-out infinite; }
          .borne-ecoute .borne-oreille-d { animation: borne-twitch-d 1.6s ease-in-out infinite 0.3s; }
          @keyframes borne-bob { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(4px); } }
          @keyframes borne-twitch-g { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-7deg); } }
          @keyframes borne-twitch-d { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(7deg); } }
        `}</style>
      </defs>

      {/* Halo */}
      <circle cx="120" cy="118" r="114" fill="url(#borne-halo)" />

      <g className={`borne-tete ${ecoute ? "borne-ecoute" : ""}`}>
        {/* Oreilles — elles frétillent quand il écoute */}
        <g className="borne-oreille-g">
          <path d="M62 66 Q44 16 84 30 Q96 50 78 70 Z" fill="url(#borne-robe)" stroke="#4A3118" strokeWidth="3" strokeLinejoin="round" />
          <path d="M67 58 Q58 26 80 36 Q86 48 76 60 Z" fill="#F2B8C6" />
        </g>
        <g className="borne-oreille-d">
          <path d="M178 66 Q196 16 156 30 Q144 50 162 70 Z" fill="url(#borne-robe)" stroke="#4A3118" strokeWidth="3" strokeLinejoin="round" />
          <path d="M173 58 Q182 26 160 36 Q154 48 164 60 Z" fill="#F2B8C6" />
        </g>

        {/* Tête */}
        <ellipse cx="120" cy="126" rx="92" ry="90" fill="url(#borne-robe)" stroke="#4A3118" strokeWidth="3" />

        {/* Liste blanche (marque du chanfrein) */}
        <path d="M108 40 Q120 34 132 40 Q130 84 126 112 Q120 120 114 112 Q110 84 108 40 Z" fill="#FFF8EC" opacity="0.9" />

        {/* Crinière : mèches qui retombent */}
        <path d="M70 46 Q120 8 170 46 Q160 32 138 28 L142 46 Q130 30 120 30 Q110 30 98 46 L102 28 Q80 32 70 46 Z"
          fill="url(#borne-criniere)" stroke="#5C3A18" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M74 46 Q66 66 74 88 Q82 70 84 52 Z" fill="url(#borne-criniere)" stroke="#5C3A18" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M166 46 Q174 66 166 88 Q158 70 156 52 Z" fill="url(#borne-criniere)" stroke="#5C3A18" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M112 34 Q118 48 112 62 Q104 50 106 38 Z" fill="#8A5A2B" />

        {/* Sourcils (petites touffes) */}
        <path d={`M80 ${76 - (ecoute ? 5 : reflechit ? 3 : 0)} Q92 ${68 - (ecoute ? 5 : reflechit ? 3 : 0)} 103 ${75 - (ecoute ? 5 : reflechit ? 3 : 0)}`}
          stroke="#5C3A18" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d={`M137 ${75 - (ecoute ? 5 : reflechit ? 3 : 0)} Q148 ${68 - (ecoute ? 5 : reflechit ? 3 : 0)} 160 ${76 - (ecoute ? 5 : reflechit ? 3 : 0)}`}
          stroke="#5C3A18" strokeWidth="4.5" fill="none" strokeLinecap="round" />

        {/* Yeux : paupière douce + double reflet */}
        {endormi ? (
          <>
            <path d="M82 96 Q91 102 100 96" stroke="#3A2A18" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M140 96 Q149 102 158 96" stroke="#3A2A18" strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="91" cy={eyeCy} rx="11" ry={eyeRy} fill="#3A2A18" />
            <ellipse cx="149" cy={eyeCy} rx="11" ry={eyeRy} fill="#3A2A18" />
            {!blink && (
              <>
                <circle cx="95" cy={eyeCy - 3.5} r="3.4" fill="#fff" />
                <circle cx="88" cy={eyeCy + 3} r="1.6" fill="#fff" opacity="0.8" />
                <circle cx="153" cy={eyeCy - 3.5} r="3.4" fill="#fff" />
                <circle cx="146" cy={eyeCy + 3} r="1.6" fill="#fff" opacity="0.8" />
              </>
            )}
          </>
        )}

        {/* Joues */}
        <ellipse cx="70" cy="122" rx="12" ry="8" fill="#F6BDB2" opacity="0.65" />
        <ellipse cx="170" cy="122" rx="12" ry="8" fill="#F6BDB2" opacity="0.65" />

        {/* Museau clair avec naseaux */}
        <ellipse cx="120" cy="152" rx="46" ry="36" fill="url(#borne-museau)" stroke="#4A3118" strokeWidth="2.5" />
        <ellipse cx="103" cy="140" rx="4.5" ry="6" fill="#8A5A3A" opacity="0.8" transform="rotate(-14 103 140)" />
        <ellipse cx="137" cy="140" rx="4.5" ry="6" fill="#8A5A3A" opacity="0.8" transform="rotate(14 137 140)" />

        {/* Bouche : ellipse pilotée en direct (attribut ry) par la boucle audio */}
        {etat === "speaking" ? (
          <ellipse ref={mouthRef} cx="120" cy="162" rx="17" ry="4" fill="#7A2E2E" stroke="#4A3118" strokeWidth="2.5" />
        ) : reflechit ? (
          <ellipse cx="120" cy="162" rx="7" ry="7" fill="#7A2E2E" stroke="#4A3118" strokeWidth="2.5" />
        ) : endormi ? (
          <path d="M104 163 Q120 167 136 163" stroke="#4A3118" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M100 158 Q120 174 140 158" stroke="#4A3118" strokeWidth="4" fill="none" strokeLinecap="round" />
        )}
      </g>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BornePage() {
  const { user, loading: authLoading } = useAuth();

  const [etat, setEtat] = useState<Etat>("off");
  const [blink, setBlink] = useState(false);
  const [sousTitre, setSousTitre] = useState("");
  const [erreur, setErreur] = useState("");

  // Objets mutables en useRef (contrainte Safari/iOS : jamais en useState)
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const mouthRef = useRef<SVGEllipseElement | null>(null);
  const etatRef = useRef<Etat>("off");
  etatRef.current = etat;
  const inactiviteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dureeMaxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef("");

  // Clignement des yeux — toutes les 3 à 6 s
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const planifier = () => {
      timer = setTimeout(() => {
        setBlink(true);
        setTimeout(() => { setBlink(false); planifier(); }, 140);
      }, 3000 + Math.random() * 3000);
    };
    planifier();
    return () => clearTimeout(timer);
  }, []);

  // Nettoyage complet au démontage
  useEffect(() => () => { raccrocherInterne(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fin de conversation ─────────────────────────────────────────────────────
  const raccrocherInterne = () => {
    if (inactiviteRef.current) clearTimeout(inactiviteRef.current);
    if (dureeMaxRef.current) clearTimeout(dureeMaxRef.current);
    cancelAnimationFrame(rafRef.current);
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.srcObject = null; }
    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
    analyserRef.current = null;
  };

  const raccrocher = useCallback(() => {
    raccrocherInterne();
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
    if (name === "chercher_creneaux") {
      try {
        const args = argsJson ? JSON.parse(argsJson) : {};
        const res = await authFetch("/api/borne/creneaux", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        output = data.result || "Aucun résultat.";
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
      case "output_audio_buffer.started":
        setEtat("speaking");
        transcriptRef.current = "";
        relancerInactivite();
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        if (etatRef.current === "speaking") setEtat("idle");
        break;
      // Transcript de la réponse — noms d'événements beta et GA gérés
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        transcriptRef.current += ev.delta || "";
        setSousTitre(transcriptRef.current);
        break;
      case "response.done": {
        // Appels d'outils demandés par le modèle
        const outputs = ev.response?.output;
        if (Array.isArray(outputs)) {
          for (const item of outputs) {
            if (item?.type === "function_call" && item.call_id) {
              executerOutil(item.name, item.call_id, item.arguments || "{}");
            }
          }
        }
        break;
      }
      case "error":
        console.error("[Borne Realtime] erreur:", ev.error);
        break;
    }
  };

  // ── Démarrage de la conversation (WebRTC) ───────────────────────────────────
  const demarrer = async () => {
    setErreur("");
    setEtat("connecting");
    try {
      // AudioContext créé sur le geste utilisateur (contrainte Safari)
      if (!audioCtxRef.current) {
        try {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch { /* bouche en oscillation de secours */ }
      }
      audioCtxRef.current?.resume().catch(() => {});

      // 1. Micro
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;

      // 2. Session éphémère créée côté serveur (clé OpenAI jamais exposée)
      const sRes = await authFetch("/api/borne/session", { method: "POST" });
      if (sRes.status === 429) throw new Error("Trop de conversations d'un coup — patientez une minute.");
      const sData = await sRes.json();
      if (!sData.clientSecret) throw new Error(sData.error || "Session vocale indisponible");

      // 3. Connexion WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Audio sortant du modèle → lecteur + analyseur pour la bouche
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = stream;
        audioElRef.current = audio;
        audio.play().catch(() => {});
        if (audioCtxRef.current) {
          try {
            const src = audioCtxRef.current.createMediaStreamSource(stream);
            const analyser = audioCtxRef.current.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            // Pas de connexion à destination : l'élément <audio> joue déjà
            // le flux, l'analyseur ne sert qu'à mesurer l'amplitude
            analyserRef.current = analyser;
          } catch { analyserRef.current = null; }
        }
      };

      pc.addTrack(mic.getTracks()[0], mic);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => surEvenement(e.data);
      dc.onopen = () => {
        setEtat("idle");
        relancerInactivite();
        // Message d'accueil dès la connexion
        dc.send(JSON.stringify({
          type: "response.create",
          response: { instructions: "Accueille le visiteur en une phrase courte et chaleureuse, et demande-lui comment tu peux l'aider." },
        }));
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
        if (etatRef.current === "speaking" && mouthRef.current) {
          let ouverture: number;
          const analyser = analyserRef.current;
          if (analyser) {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            let somme = 0;
            for (let i = 0; i < data.length; i++) somme += data[i];
            ouverture = 3 + (somme / data.length / 255) * 34;
          } else {
            ouverture = 6 + Math.abs(Math.sin(performance.now() / 90)) * 14;
          }
          mouthRef.current.setAttribute("ry", String(Math.round(ouverture)));
        }
        rafRef.current = requestAnimationFrame(animer);
      };
      rafRef.current = requestAnimationFrame(animer);

      // Durée max de conversation : garde-fou coût
      dureeMaxRef.current = setTimeout(() => raccrocher(), DUREE_MAX_MS);
    } catch (e: any) {
      raccrocherInterne();
      setEtat("off");
      setErreur(e?.message || "Impossible de démarrer la conversation.");
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
    etat === "connecting" ? "Connexion…"
    : etat === "listening" ? "Je vous écoute…"
    : etat === "thinking" ? "Je réfléchis…"
    : etat === "speaking" ? ""
    : enConversation ? "Parlez-moi, je vous écoute !"
    : "Bonjour ! Appuyez sur le bouton pour discuter avec moi";

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-blue-50 flex flex-col items-center justify-between py-8 px-6 select-none">
      {/* En-tête */}
      <header className="text-center">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-blue-800">Centre Équestre d&apos;Agon-Coutainville</h1>
        <p className="font-body text-sm text-gray-400 mt-1">Câlin, votre assistant d&apos;accueil</p>
      </header>

      {/* Visage */}
      <div className="relative w-64 h-64 md:w-80 md:h-80 my-4">
        {etat === "listening" && (
          <span className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-40" />
        )}
        <Visage etat={etat} blink={blink} mouthRef={mouthRef} />
      </div>

      {/* Sous-titres */}
      <div className="w-full max-w-2xl text-center min-h-[120px] flex flex-col items-center gap-3">
        {statusTexte && <p className="font-body text-lg md:text-xl font-semibold text-blue-800">{statusTexte}</p>}
        {sousTitre && (
          <p className="font-body text-base md:text-lg text-gray-700 leading-relaxed bg-white/80 rounded-2xl px-6 py-4 shadow-sm max-h-40 overflow-y-auto">
            {sousTitre}
          </p>
        )}
        {enConversation && etat === "idle" && !sousTitre && (
          <p className="font-body text-sm text-gray-400">
            Essayez : « Il reste de la place aux prochains stages ? » — « Quels sont les tarifs ? »
          </p>
        )}
        {erreur && <p className="font-body text-sm text-red-500">{erreur}</p>}
      </div>

      {/* Bouton principal */}
      <div className="flex flex-col items-center gap-3 pb-2">
        {etat === "off" ? (
          <button onClick={demarrer}
            className="w-24 h-24 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center border-none cursor-pointer shadow-xl transition-all">
            <Mic size={36} className="text-white" />
          </button>
        ) : etat === "connecting" ? (
          <div className="w-24 h-24 rounded-full bg-blue-500/60 flex items-center justify-center shadow-xl">
            <Loader2 size={36} className="text-white animate-spin" />
          </div>
        ) : (
          <button onClick={raccrocher}
            className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center border-none cursor-pointer shadow-xl transition-colors">
            <PhoneOff size={32} className="text-white" />
          </button>
        )}
        <p className="font-body text-xs text-gray-400">
          {etat === "off" ? "Appuyez pour discuter" : etat === "connecting" ? "Un instant…" : "Appuyez pour terminer la conversation"}
        </p>
      </div>
    </div>
  );
}
