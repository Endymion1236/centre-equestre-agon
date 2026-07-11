"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  company: string;
};

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  subject: "Renseignement général",
  message: "",
  company: "",
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 font-body text-sm text-blue-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50";

export function ContactForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const update = (field: keyof FormState, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Le message n’a pas pu être envoyé.");
      setStatus("sent");
      setForm(initialForm);
    } catch (submissionError) {
      setStatus("error");
      setError(submissionError instanceof Error ? submissionError.message : "Une erreur est survenue.");
    }
  };

  if (status === "sent") {
    return (
      <div className="rounded-[26px] border border-emerald-100 bg-white p-8 text-center shadow-[0_20px_55px_rgba(12,26,46,0.07)] sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={31} /></div>
        <h3 className="mt-5 font-display text-2xl font-bold text-blue-950">Votre message est parti</h3>
        <p className="mx-auto mt-3 max-w-sm font-body text-sm leading-relaxed text-slate-500">Merci. L’équipe vous répondra dès que possible avec les informations adaptées à votre demande.</p>
        <button type="button" onClick={() => setStatus("idle")} className="mt-7 rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 font-body text-xs font-bold text-blue-700 hover:border-blue-200">Envoyer un autre message</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[26px] border border-blue-500/[0.08] bg-white p-6 shadow-[0_20px_55px_rgba(12,26,46,0.07)] sm:p-8">
      <div className="mb-7">
        <div className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-gold-500">Écrivez-nous</div>
        <h2 className="mt-2 font-display text-2xl font-bold text-blue-950">Parlez-nous de votre projet</h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-slate-500">Âge, niveau, dates souhaitées, nombre de personnes : plus nous avons de contexte, plus la réponse sera précise.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Prénom *</span>
          <input required value={form.firstName} onChange={(event) => update("firstName", event.target.value)} className={inputClass} autoComplete="given-name" placeholder="Votre prénom" />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Nom *</span>
          <input required value={form.lastName} onChange={(event) => update("lastName", event.target.value)} className={inputClass} autoComplete="family-name" placeholder="Votre nom" />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Email *</span>
          <input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className={inputClass} autoComplete="email" placeholder="vous@exemple.fr" />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Téléphone</span>
          <input type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} className={inputClass} autoComplete="tel" placeholder="06…" />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Votre demande</span>
        <select value={form.subject} onChange={(event) => update("subject", event.target.value)} className={inputClass}>
          <option>Renseignement général</option>
          <option>Stage vacances</option>
          <option>Balade à cheval</option>
          <option>Cours réguliers / forfait annuel</option>
          <option>Anniversaire</option>
          <option>Compétition</option>
          <option>Groupe / collectivité</option>
          <option>Autre</option>
        </select>
      </label>

      <label className="mt-4 block">
        <span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Message *</span>
        <textarea required rows={6} value={form.message} onChange={(event) => update("message", event.target.value)} className={`${inputClass} resize-y`} placeholder="Indiquez l’âge, le niveau, les dates ou toute information utile…" />
      </label>

      <label className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        Société
        <input tabIndex={-1} autoComplete="off" value={form.company} onChange={(event) => update("company", event.target.value)} />
      </label>

      {status === "error" && (
        <div role="alert" className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>
      )}

      <button type="submit" disabled={status === "sending"} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border-none bg-blue-700 px-5 py-4 font-body text-sm font-bold text-white shadow-[0_9px_25px_rgba(32,80,160,0.18)] transition-all hover:-translate-y-0.5 hover:bg-blue-600 disabled:cursor-wait disabled:opacity-65">
        {status === "sending" ? <><Loader2 size={17} className="animate-spin" /> Envoi en cours…</> : <><Send size={17} /> Envoyer le message</>}
      </button>
      <p className="mt-3 text-center font-body text-[11px] leading-relaxed text-slate-400">Vos coordonnées servent uniquement à répondre à votre demande.</p>
    </form>
  );
}
