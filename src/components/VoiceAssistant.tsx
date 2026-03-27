"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, X } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  text: string;
  audioUrl?: string;
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
  voiceId = "XB0fDUnXU5powFXDhCwa", // Charlotte par défaut
  placeholder = "Posez votre question...",
  onClose,
}: VoiceAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [muted, setMuted] = useState(false);

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
      const res = await fetch("/api/whisper", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await askClaude(data.text);
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
    await askClaude(q);
  };

  // ── Claude → réponse ──────────────────────────────────────────────────────
  const askClaude = async (question: string) => {
    setLoading(true);
    addMessage("user", question);

    const defaultSystemAdmin = `Tu es l'assistant vocal de Nicolas, gérant du Centre Équestre d'Agon-Coutainville.
Réponds en français, de façon concise et naturelle (max 3 phrases) — la réponse sera lue à voix haute.
Tu as accès aux données suivantes :
${JSON.stringify(context, null, 2)}
Sois direct, chiffré si possible. Pas de markdown ni de listes — texte simple uniquement.`;

    const defaultSystemFamille = `Tu es l'assistant vocal du Centre Équestre d'Agon-Coutainville.
Tu réponds aux questions des familles sur les cours, tarifs, disponibilités et activités.
Réponds en français, chaleureusement, de façon concise (max 3 phrases) — la réponse sera lue à voix haute.
Données disponibles :
${JSON.stringify(context, null, 2)}
Pas de markdown ni de listes — texte simple uniquement.`;

    try {
      const res = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assistant",
          question,
          context: {
            ...context,
            _systemOverride: systemPrompt || (mode === "admin" ? defaultSystemAdmin : defaultSystemFamille),
          },
        }),
      });
      const data = await res.json();
      const answer = data.answer || data.error || "Je n'ai pas pu répondre.";
      addMessage("assistant", answer);
      if (!muted) await speakText(answer);
    } catch (e: any) {
      addMessage("assistant", "Désolé, une erreur est survenue.");
    }
    setLoading(false);
    setTimeout(scrollToBottom, 100);
  };

  // ── TTS ElevenLabs streaming ──────────────────────────────────────────────
  const speakText = async (text: string) => {
    setSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      });
      if (!res.ok) throw new Error("TTS error");

      // Streaming : lire le flux audio dès les premiers octets reçus
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeaking(false);
  };

  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages(prev => [...prev, { role, text }]);
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
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl font-body text-sm leading-relaxed ${
              m.role === "user"
                ? "text-white rounded-br-sm"
                : "bg-gray-50 text-gray-700 rounded-bl-sm border border-gray-100"
            }`} style={m.role === "user" ? { background: gradientBg } : {}}>
              {m.text}
            </div>
          </div>
        ))}
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
