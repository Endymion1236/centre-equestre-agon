"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface Message {
  role: "user" | "assistant";
  text: string;
  audioUrl?: string;
  actionLink?: { label: string; href: string };
}

interface VoiceAssistantProps {
  mode: "admin" | "famille";
  context?: Record<string, any>;
  systemPrompt?: string;
  voiceId?: string; // ID de voix ElevenLabs
  placeholder?: string;
  onClose?: () => void;
}

export default function VoiceAssistant({
  mode,
  context = {},
  systemPrompt,
  voiceId = "FvmvwvObRqIHojkEGh5N", // Voix custom par défaut
  placeholder = "Posez votre question...",
  onClose,
}: VoiceAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [muted, setMuted] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ tool: string; input: any } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ── Enregistrement micro → Whisper ────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `question.${ext}`, { type: mimeType });
        await transcribeAndAnswer(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setRecording(true);
    } catch (e: any) {
      alert(`Micro inaccessible : ${e.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // ── Transcription Whisper ─────────────────────────────────────────────────
  const transcribeAndAnswer = async (file: File) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const res = await authFetch("/api/whisper", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const text = data.text?.trim() || "";

      // Si une action est en attente et que la réponse est une confirmation vocale
      if (pendingAction && mode === "admin") {
        const confirmWords = ["oui", "confirme", "je confirme", "yes", "ok", "c'est bon", "vas-y", "go", "affirmatif"];
        const cancelWords = ["non", "annule", "annuler", "no", "stop", "laisse tomber"];
        const lower = text.toLowerCase();
        if (confirmWords.some(w => lower.includes(w))) {
          await askClaude("Oui, confirme.", true);
          setLoading(false);
          return;
        }
        if (cancelWords.some(w => lower.includes(w))) {
          setPendingAction(null);
          addMessage("assistant", "Action annulée.");
          if (!muted) await speakText("Action annulée.");
          setLoading(false);
          return;
        }
      }

      await askClaude(text);
    } catch (e: any) {
      addMessage("assistant", `Désolé, je n'ai pas pu transcrire votre question. (${e.message})`);
    }
    setLoading(false);
  };

  // ── Question texte ────────────────────────────────────────────────────────
  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    const q = textInput.trim();
    setTextInput("");

    // Même détection pour le texte
    if (pendingAction && mode === "admin") {
      const lower = q.toLowerCase();
      const confirmWords = ["oui", "confirme", "je confirme", "yes", "ok", "c'est bon", "vas-y", "go"];
      const cancelWords = ["non", "annule", "annuler", "no", "stop"];
      if (confirmWords.some(w => lower.includes(w))) {
        await askClaude("Oui, confirme.", true);
        return;
      }
      if (cancelWords.some(w => lower.includes(w))) {
        setPendingAction(null);
        addMessage("assistant", "Action annulée.");
        return;
      }
    }

    await askClaude(q);
  };

  // ── Claude → réponse / Agent ─────────────────────────────────────────────
  const askClaude = async (question: string, isConfirmation = false) => {
    setLoading(true);
    if (!isConfirmation) addMessage("user", question);

    const defaultSystemFamille = `Tu es l'assistant vocal du Centre Équestre d'Agon-Coutainville.
Tu réponds aux questions des familles sur les cours, tarifs, disponibilités et activités.

RÈGLE ABSOLUE : Tu ne peux PAS créer d'inscription, de réservation, ni de paiement. Tu n'as accès à aucun outil pour le faire.
Si quelqu'un dit "oui", "je veux m'inscrire", "inscris-moi", "réserve", "ok" après une proposition — tu NE DIS PAS "c'est fait" ou "je vous inscris". Tu réponds que l'inscription se fait via le bouton ci-dessous, et tu fournis le lien.

Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks, avec cette structure :
{ "text": "ta réponse en 1-3 phrases", "action": null }

Si la famille parle d'inscription, de réservation, de paiement, ou confirme vouloir s'inscrire (oui, ok, go, je veux, inscris-moi...) :
{ "text": "Pour vous inscrire, utilisez le bouton ci-dessous — c'est rapide et sécurisé !", "action": { "label": "Réserver maintenant", "href": "/espace-cavalier/reserver" } }

Si elle demande à voir son profil ou ses informations : href = "/espace-cavalier/profil"
Si elle veut voir ses paiements : href = "/espace-cavalier/paiements"

Réponds toujours chaleureusement, en français. La réponse "text" sera lue à voix haute — pas de listes ni markdown.
Données disponibles :
${JSON.stringify(context, null, 2)}`;

    try {
      if (mode === "admin") {
        // ── Agent avec outils Firestore ──────────────────────────────────
        const res = await authFetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            context,
            confirmed: isConfirmation,
            pendingAction: isConfirmation ? pendingAction : null,
            // Historique des 10 derniers messages pour la mémoire conversationnelle
            history: messages.slice(-10).map(m => ({
              role: m.role,
              content: m.text,
            })),
          }),
        });
        const data = await res.json();
        if (data.type === "confirm") {
          setPendingAction(data.pendingAction);
          addMessage("assistant", data.message);
          if (!muted) await speakText(data.message);
          setLoading(false);
          return;
        }
        // Si c'est le résultat d'une confirmation, ajouter "Confirmé" dans l'historique
        if (isConfirmation) {
          addMessage("user", "✓ Confirmé");
        }
        setPendingAction(null);
        const answer = data.message || data.answer || data.error || "Je n'ai pas pu répondre.";
        addMessage("assistant", answer);
        if (!muted) await speakText(answer);
      } else {
        // ── Chatbot famille simple ───────────────────────────────────────
        const res = await authFetch("/api/ia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "assistant",
            question,
            context: { ...context, _systemOverride: systemPrompt || defaultSystemFamille },
          }),
        });
        const data = await res.json();
        let answer = data.answer || data.error || "Je n'ai pas pu répondre.";
        let actionLink: { label: string; href: string } | undefined;
        // Tenter de parser le JSON structuré retourné par le system prompt famille
        // L'IA entoure parfois le JSON de backticks markdown — on nettoie avant de parser
        try {
          const cleaned = answer
            .replace(/^\s*```json\s*/i, "")
            .replace(/^\s*```\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.text) {
            answer = parsed.text;
            if (parsed.action?.href) actionLink = parsed.action;
          }
        } catch {
          // Réponse en texte brut — on garde telle quelle
        }
        addMessage("assistant", answer, actionLink);
        if (!muted) await speakText(answer);
      }
    } catch (e: any) {
      addMessage("assistant", "Désolé, une erreur est survenue.");
    }
    setLoading(false);
    setTimeout(scrollToBottom, 100);
  };

  // ── TTS ElevenLabs streaming ──────────────────────────────────────────────
  const speakText = async (text: string) => {
    setSpeaking(true);
    // Arrêter l'audio précédent
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try {
      const res = await authFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      });
      if (!res.ok) throw new Error("TTS error");

      // Streaming via MediaSource — démarre la lecture dès les premiers octets
      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      const audio = new Audio(url);
      audioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        mediaSource.addEventListener("sourceopen", async () => {
          const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
          const reader = res.body!.getReader();
          let playStarted = false;

          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  // Attendre que le sourceBuffer soit libre avant de clore
                  if (!sourceBuffer.updating) {
                    mediaSource.endOfStream();
                  } else {
                    sourceBuffer.addEventListener("updateend", () => mediaSource.endOfStream(), { once: true });
                  }
                  break;
                }
                // Attendre que le buffer soit prêt avant d'ajouter
                if (sourceBuffer.updating) {
                  await new Promise<void>(r => sourceBuffer.addEventListener("updateend", () => r(), { once: true }));
                }
                sourceBuffer.appendBuffer(value);
                // Démarrer la lecture dès qu'on a assez de données
                if (!playStarted && audio.readyState >= 2) {
                  playStarted = true;
                  audio.play().catch(() => {});
                } else if (!playStarted) {
                  await new Promise<void>(r => audio.addEventListener("canplay", () => r(), { once: true }));
                  playStarted = true;
                  audio.play().catch(() => {});
                }
              }
            } catch (e) {
              reject(e);
            }
          };

          pump();
          audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); resolve(); };
        }, { once: true });
      });
    } catch {
      setSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeaking(false);
  };

  const addMessage = (role: "user" | "assistant", text: string, actionLink?: { label: string; href: string }) => {
    setMessages(prev => [...prev, { role, text, actionLink }]);
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  const isAdmin = mode === "admin";
  const gradientBg = isAdmin
    ? "linear-gradient(135deg,#0C1A2E,#122A5A)"
    : "linear-gradient(135deg,#1a6b3c,#0C1A2E)";

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: gradientBg }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            {speaking
              ? <Volume2 size={18} className="text-white animate-pulse" />
              : <Mic size={18} className="text-white" />}
          </div>
          <div>
            <div className="font-body text-sm font-semibold text-white">
              {isAdmin ? "Assistant vocal — Admin" : "Assistant Centre Équestre"}
            </div>
            <div className="font-body text-[10px] text-white/50">
              {speaking ? "En train de répondre..." : loading ? "Réflexion..." : "Prêt"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Bouton Stop — visible uniquement quand l'IA parle */}
          {speaking && (
            <button onClick={stopSpeaking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 border-none cursor-pointer transition-all animate-pulse">
              <span className="w-2 h-2 rounded-sm bg-white" />
              <span className="font-body text-[11px] font-semibold text-white">Stop</span>
            </button>
          )}
          <button onClick={() => { setMuted(!muted); if (speaking) stopSpeaking(); }}
            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border-none cursor-pointer hover:bg-white/20">
            {muted ? <VolumeX size={14} className="text-white/50" /> : <Volume2 size={14} className="text-white" />}
          </button>
          {onClose && (
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border-none cursor-pointer hover:bg-white/20">
              <X size={14} className="text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" style={{ minHeight: 200, maxHeight: 350 }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: gradientBg }}>
              <Mic size={28} className="text-white" />
            </div>
            <p className="font-body text-sm text-gray-400 text-center">
              {isAdmin
                ? "Posez une question sur votre planning, vos paiements ou vos stats"
                : "Bonjour ! Comment puis-je vous aider ?"}
            </p>
            {/* Suggestions */}
            <div className="flex flex-col gap-1.5 w-full max-w-xs">
              {(isAdmin ? [
                "Combien d'inscrits cette semaine ?",
                "Qui n'a pas payé ce mois ?",
                "Quel est le taux de remplissage ?",
              ] : [
                "Quels sont les tarifs des cours ?",
                "Y a-t-il des places disponibles ?",
                "Comment inscrire mon enfant ?",
              ]).map(q => (
                <button key={q} onClick={() => askClaude(q)}
                  className="text-left font-body text-xs px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 cursor-pointer text-gray-600 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const isLastAssistant = m.role === "assistant" && i === messages.length - 1;
          const needsConfirm = isLastAssistant && (
            m.text.toLowerCase().includes("tu confirmes") ||
            m.text.toLowerCase().includes("tu confirms")
          );
          return (
            <div key={i} className="flex flex-col gap-2">
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl font-body text-sm leading-relaxed ${
                  m.role === "user"
                    ? "text-white rounded-br-sm"
                    : "bg-gray-50 text-gray-700 rounded-bl-sm border border-gray-100"
                }`} style={m.role === "user" ? { background: gradientBg } : {}}>
                  {m.text}
                </div>
              </div>
              {/* Bouton action famille (ex: Réserver) */}
              {m.actionLink && mode === "famille" && (
                <a href={m.actionLink.href}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-bold text-white no-underline hover:opacity-90 transition-opacity"
                  style={{ background: gradientBg }}>
                  → {m.actionLink.label}
                </a>
              )}
              {/* Boutons confirmation directement sous le message */}
              {needsConfirm && !loading && mode === "admin" && (
                <div className="flex gap-2">
                  <button onClick={() => askClaude("Oui, confirme.", true)}
                    className="flex-1 py-2.5 rounded-xl font-body text-sm font-bold text-white bg-green-500 hover:bg-green-600 border-none cursor-pointer">
                    ✓ Confirmer
                  </button>
                  <button onClick={() => { setPendingAction(null); addMessage("assistant", "Action annulée."); }}
                    className="flex-1 py-2.5 rounded-xl font-body text-sm font-bold text-slate-700 bg-gray-200 hover:bg-gray-300 border-none cursor-pointer">
                    ✕ Annuler
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-gray-400" />
              <span className="font-body text-sm text-gray-400">...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-100">

        {/* Boutons confirmation agent — au-dessus de la saisie */}
        {pendingAction && mode === "admin" && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => askClaude("Oui, confirme.", true)}
              disabled={loading}
              className="flex-1 py-3 rounded-xl font-body text-sm font-bold text-white bg-green-500 hover:bg-green-600 border-none cursor-pointer disabled:opacity-50 shadow-sm">
              ✓ Oui, confirmer
            </button>
            <button
              onClick={() => { setPendingAction(null); addMessage("assistant", "Action annulée."); }}
              disabled={loading}
              className="flex-1 py-3 rounded-xl font-body text-sm font-bold text-slate-700 bg-gray-200 hover:bg-gray-300 border-none cursor-pointer disabled:opacity-50">
              ✕ Annuler
            </button>
          </div>
        )}

        <div className="flex gap-2 items-center">
          {/* Bouton micro */}
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={loading}
            className={`w-12 h-12 rounded-xl flex items-center justify-center border-none cursor-pointer flex-shrink-0 transition-all disabled:opacity-40 ${
              recording ? "bg-red-500 animate-pulse" : "text-white"
            }`}
            style={!recording ? { background: gradientBg } : {}}>
            {recording ? <MicOff size={20} className="text-white" /> : <Mic size={20} />}
          </button>
          {/* Champ texte */}
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
            placeholder={recording ? "🎙️ Enregistrement..." : placeholder}
            disabled={recording || loading}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
          />
          {/* Bouton envoyer */}
          {textInput.trim() && (
            <button onClick={handleTextSubmit} disabled={loading}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white border-none cursor-pointer flex-shrink-0"
              style={{ background: gradientBg }}>
              ↑
            </button>
          )}
        </div>

        {recording && (
          <div className="flex items-center gap-2 mt-2 px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-body text-[10px] text-red-500">Enregistrement — appuyez sur le micro pour arrêter</span>
          </div>
        )}
      </div>
    </div>
  );
}
