"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Check, CreditCard, Gift, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";

const PRESETS = [30, 50, 100, 150];
const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 font-body text-sm text-blue-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-50";

export default function OffrirUnBonPage() {
  const [montant, setMontant] = useState("50");
  const [beneficiaire, setBeneficiaire] = useState("");
  const [message, setMessage] = useState("");
  const [acheteurNom, setAcheteurNom] = useState("");
  const [acheteurEmail, setAcheteurEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("cancelled")) {
      setErreur("Le paiement a été annulé ou n’a pas abouti. Aucun montant n’a été débité.");
    }
  }, []);

  const payer = async () => {
    setErreur("");
    const amount = Number.parseFloat(montant.replace(",", "."));
    if (!amount || amount < 10 || amount > 500) {
      setErreur("Le montant doit être compris entre 10 € et 500 €.");
      return;
    }
    if (!acheteurEmail.includes("@")) {
      setErreur("Indiquez un email valide pour recevoir le bon.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/bon-cadeau/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montant: amount, beneficiaire, message, acheteurNom, acheteurEmail }),
      });
      const data = await response.json();
      if (!response.ok || !data.redirectUrl) {
        setErreur(data.error || "Le paiement est momentanément indisponible. Réessayez dans un instant.");
        setBusy(false);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setErreur("Une erreur est survenue. Réessayez dans un instant.");
      setBusy(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-cream">
        <section className="relative overflow-hidden bg-[linear-gradient(135deg,#06130e_0%,#0a3324_52%,#0f6846_100%)] px-5 pb-24 pt-36 text-white sm:px-6 sm:pb-28 sm:pt-40">
          <div className="pointer-events-none absolute -right-32 -top-48 h-[520px] w-[520px] rounded-full border border-white/[0.06] bg-white/[0.03]" />
          <div className="relative mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[1fr_0.88fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-2 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300"><Gift size={14} /> Une expérience à offrir</div>
              <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">Offrez des souvenirs plutôt qu’un objet</h1>
              <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/65 sm:text-lg">Choisissez le montant, ajoutez un prénom et un message. Le bon et son code sont envoyés par email après le paiement sécurisé.</p>

              <div className="mt-9 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {[
                  { icon: Sparkles, title: "Libre choix", text: "Stage, balade, cours ou autre activité disponible" },
                  { icon: Mail, title: "Reçu par email", text: "Prêt à imprimer ou à transmettre" },
                  { icon: ShieldCheck, title: "Paiement sécurisé", text: "Carte bancaire via le Crédit Agricole" },
                ].map((item) => {
                  const Icon = item.icon;
                  return <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300"><Icon size={19} /></div><div><div className="font-body text-sm font-bold text-white">{item.title}</div><div className="mt-1 font-body text-xs leading-relaxed text-white/45">{item.text}</div></div></div>;
                })}
              </div>
            </div>

            <div className="relative min-h-[380px] overflow-hidden rounded-[32px] border border-white/12 bg-white/[0.06] shadow-[0_30px_85px_rgba(0,0,0,0.24)]">
              <img src="/images/vitrine/choices/anniversaire-poney.webp" alt="Un anniversaire au centre équestre avec un enfant et un poney" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/58 via-transparent to-white/5" />
              <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/14 bg-emerald-950/58 p-5 backdrop-blur-md">
                <div className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Pour toutes les occasions</div>
                <div className="mt-2 font-display text-2xl font-bold text-white">Anniversaire, vacances ou simple envie de faire plaisir</div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-[1080px] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Comment ça marche</div>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-blue-950">Un cadeau simple à acheter, agréable à choisir</h2>
              <p className="mt-4 font-body text-sm leading-relaxed text-slate-500">Le bénéficiaire utilise ensuite le code du bon lors d’un paiement compatible ou le présente au centre pour organiser son activité.</p>
              <div className="mt-7 space-y-3">
                {[
                  "Vous choisissez un montant entre 10 € et 500 €",
                  "Vous pouvez personnaliser le prénom et le message",
                  "Vous réglez par carte sur la page sécurisée",
                  "Le bon et son code arrivent par email",
                ].map((step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-2xl border border-blue-500/[0.07] bg-white p-4 shadow-[0_8px_28px_rgba(12,26,46,0.03)]">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 font-display text-sm font-bold text-emerald-700">{index + 1}</span>
                    <span className="font-body text-sm font-semibold leading-relaxed text-blue-950">{step}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl bg-blue-50 p-5">
                <div className="flex items-center gap-2 font-body text-xs font-bold text-blue-800"><Check size={15} /> Besoin d’aide avant l’achat ?</div>
                <p className="mt-2 font-body text-xs leading-relaxed text-slate-500">L’équipe peut vous conseiller sur le montant selon l’activité envisagée.</p>
                <Link href="/contact" className="mt-3 inline-block font-body text-xs font-bold text-blue-700 no-underline">Nous contacter →</Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-blue-500/[0.08] bg-white p-6 shadow-[0_22px_60px_rgba(12,26,46,0.08)] sm:p-8">
              <div className="mb-7 flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Gift size={23} /></div><div><div className="font-display text-2xl font-bold text-blue-950">Créer votre bon cadeau</div><div className="font-body text-xs text-slate-400">Les champs bénéficiaire et message sont facultatifs</div></div></div>

              <label className="block font-body text-xs font-bold text-blue-950">Montant du bon</label>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {PRESETS.map((preset) => (
                  <button key={preset} type="button" onClick={() => setMontant(String(preset))} className={`rounded-xl border px-2 py-3 font-body text-sm font-bold transition-all ${montant === String(preset) ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_7px_20px_rgba(5,150,105,0.18)]" : "border-slate-200 bg-white text-blue-950 hover:border-emerald-200"}`}>{preset} €</button>
                ))}
              </div>
              <div className="relative mt-3"><input type="number" min={10} max={500} value={montant} onChange={(event) => setMontant(event.target.value)} placeholder="Montant libre" className={`${inputClass} pr-10`} /><span className="absolute right-4 top-1/2 -translate-y-1/2 font-body text-sm font-bold text-slate-400">€</span></div>

              <div className="mt-7 border-t border-slate-100 pt-7">
                <label className="block font-body text-xs font-bold text-blue-950">Prénom du bénéficiaire <span className="font-normal text-slate-400">(facultatif)</span></label>
                <input value={beneficiaire} onChange={(event) => setBeneficiaire(event.target.value)} placeholder="La personne à qui vous offrez le bon" className={`${inputClass} mt-2`} />

                <label className="mt-5 block font-body text-xs font-bold text-blue-950">Votre message <span className="font-normal text-slate-400">(facultatif)</span></label>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Joyeux anniversaire !" rows={4} className={`${inputClass} mt-2 resize-y`} />
              </div>

              <div className="mt-7 border-t border-slate-100 pt-7">
                <div className="font-display text-lg font-bold text-blue-950">Vos coordonnées</div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Votre nom</span><input value={acheteurNom} onChange={(event) => setAcheteurNom(event.target.value)} placeholder="Nom de l’acheteur" className={inputClass} /></label>
                  <label className="block"><span className="mb-1.5 block font-body text-xs font-bold text-blue-950">Votre email *</span><input required type="email" value={acheteurEmail} onChange={(event) => setAcheteurEmail(event.target.value)} placeholder="Pour recevoir le bon" className={inputClass} /></label>
                </div>
              </div>

              {erreur && <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 font-body text-sm leading-relaxed text-amber-800">{erreur}</div>}

              <button type="button" onClick={payer} disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border-none bg-emerald-600 px-5 py-4 font-body text-base font-bold text-white shadow-[0_10px_28px_rgba(5,150,105,0.2)] transition-all hover:-translate-y-0.5 hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60">
                {busy ? <><Loader2 size={18} className="animate-spin" /> Préparation du paiement…</> : <><CreditCard size={18} /> Payer {montant || "—"} € par carte</>}
              </button>
              <p className="mt-3 text-center font-body text-[11px] text-slate-400">Vous serez redirigé vers la page de paiement sécurisée du Crédit Agricole.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
