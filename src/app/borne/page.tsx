"use client";

/**
 * Borne d'accueil — V1 lecture seule.
 *
 * Écran plein format (tablette à l'accueil) avec un visage animé qui
 * répond à la voix : micro → /api/whisper → /api/borne (IA lecture seule)
 * → /api/tts (ElevenLabs) → bouche synchronisée sur l'amplitude audio.
 *
 * La tablette doit rester connectée avec un compte Firebase (compte borne
 * dédié ou compte club) : toutes les routes appelées exigent un token.
 * Aucune écriture en base depuis cette page — l'inscription réelle passe
 * par l'espace cavalier.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";

type Etat = "idle" | "listening" | "thinking" | "speaking";

interface Echange {
  question: string;
  reponse: string;
  action?: { label: string; href: string } | null;
}

// ── Visage SVG animé ──────────────────────────────────────────────────────────

function Visage({ etat, blink, mouthRef }: {
  etat: Etat;
  blink: boolean;
  mouthRef: React.RefObject<SVGEllipseElement | null>;
}) {
  // Yeux : fermés brièvement au clignement, plissés-souriants en idle,
  // grands ouverts en écoute, regard levé en réflexion
  const eyeRy = blink ? 1 : etat === "listening" ? 13 : 10;
  const eyeCy = etat === "thinking" ? 84 : 90;
  // Sourcils légèrement levés quand la borne écoute
  const browLift = etat === "listening" ? 6 : etat === "thinking" ? 4 : 0;

  return (
    <svg viewBox="0 0 240 240" className="w-full h-full" aria-hidden="true">
      {/* Halo doux derrière la tête */}
      <circle cx="120" cy="120" r="112" fill="#EEF4FF" />
      {/* Tête */}
      <circle cx="120" cy="120" r="96" fill="#FFE7C9" stroke="#0C1A2E" strokeWidth="3" />
      {/* Oreilles de poney — c'est un centre équestre, autant l'assumer */}
      <g stroke="#0C1A2E" strokeWidth="3" fill="#FFE7C9">
        <path d="M58 52 Q50 14 82 30 Q90 48 74 62 Z" />
        <path d="M182 52 Q190 14 158 30 Q150 48 166 62 Z" />
      </g>
      <path d="M64 48 Q60 28 78 36 Q82 46 72 54 Z" fill="#F5B8C4" />
      <path d="M176 48 Q180 28 162 36 Q158 46 168 54 Z" fill="#F5B8C4" />
      {/* Mèche */}
      <path d="M90 34 Q120 16 150 34 Q138 26 120 28 Q102 26 90 34 Z" fill="#8A5A2B" />
      <path d="M96 32 Q120 20 144 32 L140 44 Q120 34 100 44 Z" fill="#8A5A2B" />
      {/* Sourcils */}
      <path d={`M78 ${72 - browLift} Q92 ${64 - browLift} 104 ${72 - browLift}`} stroke="#0C1A2E" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d={`M136 ${72 - browLift} Q148 ${64 - browLift} 162 ${72 - browLift}`} stroke="#0C1A2E" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* Yeux */}
      <ellipse cx="91" cy={eyeCy} rx="10" ry={eyeRy} fill="#0C1A2E" />
      <ellipse cx="149" cy={eyeCy} rx="10" ry={eyeRy} fill="#0C1A2E" />
      {!blink && (
        <>
          <circle cx="94" cy={eyeCy - 3} r="3" fill="#fff" />
          <circle cx="152" cy={eyeCy - 3} r="3" fill="#fff" />
        </>
      )}
      {/* Joues */}
      <circle cx="74" cy="122" r="10" fill="#F9C8C0" opacity="0.7" />
      <circle cx="166" cy="122" r="10" fill="#F9C8C0" opacity="0.7" />
      {/* Museau / nez */}
      <ellipse cx="120" cy="118" rx="10" ry="7" fill="#E8A87C" />
      {/* Bouche : l'ellipse est animée en direct (attribut ry) par la boucle
          audio pendant que la borne parle — pas de re-render React à 60 fps */}
      {etat === "speaking" ? (
        <ellipse ref={mouthRef} cx="120" cy="152" rx="20" ry="4" fill="#7A2E2E" stroke="#0C1A2E" strokeWidth="2.5" />
      ) : etat === "thinking" ? (
        <ellipse cx="120" cy="152" rx="8" ry="8" fill="#7A2E2E" stroke="#0C1A2E" strokeWidth="2.5" />
      ) : (
        <path d="M96 148 Q120 168 144 148" stroke="#0C1A2E" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BornePage() {
  const { user, loading: authLoading } = useAuth();

  const [etat, setEtat] = useState<Etat>("idle");
  const [blink, setBlink] = useState(false);
  const [dernierEchange, setDernierEchange] = useState<Echange | null>(null);
  const [sousTitre, setSousTitre] = useState("");
  const [erreur, setErreur] = useState("");
  const [historique, setHistorique] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  // Objets mutables en useRef (contrainte Safari/iOS : jamais MediaRecorder en useState)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const mouthRef = useRef<SVGEllipseElement | null>(null);
  const etatRef = useRef<Etat>("idle");
  etatRef.current = etat;

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

  // Retour à l'accueil visuel après 45 s sans interaction (borne publique)
  useEffect(() => {
    if (etat !== "idle" || (!dernierEchange && !erreur)) return;
    const t = setTimeout(() => { setDernierEchange(null); setSousTitre(""); setErreur(""); setHistorique([]); }, 45_000);
    return () => clearTimeout(t);
  }, [etat, dernierEchange, erreur]);

  // ── Enregistrement micro ────────────────────────────────────────────────────
  const demarrerEcoute = async () => {
    setErreur("");
    // AudioContext créé sur le geste utilisateur (contrainte Safari)
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch { /* analyseur indisponible : la bouche s'animera en secours */ }
    }
    audioCtxRef.current?.resume().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 2000) { setEtat("idle"); return; } // appui accidentel
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        await traiterQuestion(new File([blob], `question.${ext}`, { type: mimeType }));
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setEtat("listening");
    } catch (e: any) {
      setErreur("Le micro est inaccessible. Vérifiez les autorisations de la tablette.");
      setEtat("idle");
    }
  };

  const arreterEcoute = () => {
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    setEtat("thinking");
  };

  // ── Pipeline : transcription → IA → voix ────────────────────────────────────
  const traiterQuestion = async (file: File) => {
    setEtat("thinking");
    try {
      // 1. Transcription
      const fd = new FormData();
      fd.append("audio", file);
      const wRes = await authFetch("/api/whisper", { method: "POST", body: fd });
      const wData = await wRes.json();
      if (!wData.success) throw new Error(wData.error || "Transcription impossible");
      const question = (wData.text || "").trim();
      if (!question) { setEtat("idle"); return; }
      setSousTitre(question);

      // 2. IA lecture seule
      const bRes = await authFetch("/api/borne", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: historique.slice(-10) }),
      });
      if (bRes.status === 429) throw new Error("Beaucoup de questions d'un coup ! Patientez une minute.");
      const bData = await bRes.json();
      const reponse = bData.text || "Je n'ai pas pu répondre, désolé.";

      setHistorique((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: reponse }]);
      setDernierEchange({ question, reponse, action: bData.action || null });

      // 3. Voix + bouche synchronisée
      await parler(reponse);
    } catch (e: any) {
      setErreur(e?.message || "Une erreur est survenue.");
      setEtat("idle");
    }
  };

  // ── TTS streaming + animation de la bouche ─────────────────────────────────
  const parler = async (texte: string) => {
    setEtat("speaking");
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try {
      const res = await authFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: texte }),
      });
      if (!res.ok) throw new Error("TTS indisponible");

      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      const audio = new Audio(url);
      audioRef.current = audio;

      // Analyseur d'amplitude → ouverture de la bouche.
      // createMediaElementSource ne peut être appelé qu'une fois par élément :
      // chaque réponse crée un nouvel élément Audio, donc pas de conflit.
      let analyser: AnalyserNode | null = null;
      if (audioCtxRef.current) {
        try {
          const src = audioCtxRef.current.createMediaElementSource(audio);
          analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          analyser.connect(audioCtxRef.current.destination);
        } catch { analyser = null; }
      }
      const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

      const animerBouche = () => {
        if (etatRef.current !== "speaking") return;
        let ouverture: number;
        if (analyser && data) {
          analyser.getByteFrequencyData(data);
          let somme = 0;
          for (let i = 0; i < data.length; i++) somme += data[i];
          const amplitude = somme / data.length / 255; // 0..1
          ouverture = 3 + amplitude * 34;
        } else {
          // Secours sans analyseur : oscillation pseudo-aléatoire
          ouverture = 6 + Math.abs(Math.sin(performance.now() / 90)) * 14;
        }
        mouthRef.current?.setAttribute("ry", String(Math.round(ouverture)));
        rafRef.current = requestAnimationFrame(animerBouche);
      };
      rafRef.current = requestAnimationFrame(animerBouche);

      await new Promise<void>((resolve) => {
        const terminer = () => {
          cancelAnimationFrame(rafRef.current);
          setEtat("idle");
          URL.revokeObjectURL(url);
          resolve();
        };
        mediaSource.addEventListener("sourceopen", async () => {
          const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
          const reader = res.body!.getReader();
          let playStarted = false;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (!sourceBuffer.updating) mediaSource.endOfStream();
                else sourceBuffer.addEventListener("updateend", () => mediaSource.endOfStream(), { once: true });
                break;
              }
              if (sourceBuffer.updating) {
                await new Promise<void>((r) => sourceBuffer.addEventListener("updateend", () => r(), { once: true }));
              }
              sourceBuffer.appendBuffer(value);
              if (!playStarted) {
                if (audio.readyState < 2) {
                  await new Promise<void>((r) => audio.addEventListener("canplay", () => r(), { once: true }));
                }
                playStarted = true;
                audio.play().catch(() => {});
              }
            }
          } catch { terminer(); }
          audio.onended = terminer;
          audio.onerror = terminer;
        }, { once: true });
      });
    } catch {
      cancelAnimationFrame(rafRef.current);
      setEtat("idle");
    }
  };

  const interrompre = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    cancelAnimationFrame(rafRef.current);
    setEtat("idle");
  }, []);

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
  const statusTexte =
    etat === "listening" ? "Je vous écoute…"
    : etat === "thinking" ? "Je réfléchis…"
    : etat === "speaking" ? "…"
    : dernierEchange ? "Une autre question ?"
    : "Bonjour ! Appuyez sur le bouton et posez-moi votre question";

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
        <p className="font-body text-lg md:text-xl font-semibold text-blue-800">{statusTexte}</p>
        {sousTitre && etat !== "listening" && (
          <p className="font-body text-sm text-gray-400 italic">« {sousTitre} »</p>
        )}
        {dernierEchange && etat !== "listening" && (
          <p className="font-body text-base md:text-lg text-gray-700 leading-relaxed bg-white/80 rounded-2xl px-6 py-4 shadow-sm">
            {dernierEchange.reponse}
          </p>
        )}
        {dernierEchange?.action && etat === "idle" && (
          <a href={dernierEchange.action.href}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-body text-lg font-bold no-underline shadow-lg transition-colors">
            → {dernierEchange.action.label}
          </a>
        )}
        {erreur && <p className="font-body text-sm text-red-500">{erreur}</p>}
      </div>

      {/* Bouton principal */}
      <div className="flex flex-col items-center gap-3 pb-2">
        {etat === "speaking" ? (
          <button onClick={interrompre}
            className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center border-none cursor-pointer shadow-xl transition-colors">
            <Square size={32} className="text-white" fill="white" />
          </button>
        ) : etat === "thinking" ? (
          <div className="w-24 h-24 rounded-full bg-blue-500/60 flex items-center justify-center shadow-xl">
            <Loader2 size={36} className="text-white animate-spin" />
          </div>
        ) : (
          <button
            onClick={etat === "listening" ? arreterEcoute : demarrerEcoute}
            className={`w-24 h-24 rounded-full flex items-center justify-center border-none cursor-pointer shadow-xl transition-all ${
              etat === "listening" ? "bg-red-500 animate-pulse scale-110" : "bg-blue-500 hover:bg-blue-600"
            }`}>
            <Mic size={36} className="text-white" />
          </button>
        )}
        <p className="font-body text-xs text-gray-400">
          {etat === "listening" ? "Appuyez pour terminer" : etat === "speaking" ? "Appuyez pour m'interrompre" : "Appuyez pour parler"}
        </p>
        {dernierEchange && etat === "idle" && (
          <button onClick={() => { setDernierEchange(null); setSousTitre(""); setHistorique([]); }}
            className="flex items-center gap-1.5 font-body text-xs text-gray-400 bg-transparent border-none cursor-pointer hover:text-blue-500">
            <RotateCcw size={12} /> Nouvelle conversation
          </button>
        )}
      </div>
    </div>
  );
}
