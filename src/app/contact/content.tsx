"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import IllustratedFeatureBand from "@/components/public/IllustratedFeatureBand";
import { ContactForm } from "./form";
import { useVitrine } from "@/lib/use-vitrine";
import { SCHEDULE, SITE_CONFIG } from "@/lib/config";
import { Clock3, Facebook, Mail, MapPin, Navigation, Phone } from "lucide-react";

function parseAddress(full: string): { street: string; zipCity: string } {
  const parts = full.split(",").map((value) => value.trim()).filter(Boolean);
  if (parts.length >= 2) return { street: parts[0], zipCity: parts.slice(1).join(", ") };
  return { street: full, zipCity: "" };
}

export function ContactPageContent() {
  const { vitrine } = useVitrine();
  const address = vitrine.infos.adresse || `${SITE_CONFIG.address.street}, ${SITE_CONFIG.address.zip} ${SITE_CONFIG.address.city}`;
  const { street, zipCity } = parseAddress(address);
  const phone = vitrine.infos.telephone || SITE_CONFIG.contact.phone;
  const secondaryPhone = (vitrine.infos as { telephone_secondaire?: string }).telephone_secondaire || "";
  const email = vitrine.infos.email || SITE_CONFIG.contact.email;
  const mapQuery = encodeURIComponent(`${street} ${zipCity}`.trim());

  return (
    <>
      <Navbar />
      <main className="bg-cream">
        <section className="relative overflow-hidden bg-[linear-gradient(135deg,#07111f_0%,#12346b_58%,#2050a0_100%)] px-6 pb-24 pt-36 text-white sm:pb-28 sm:pt-40">
          <div className="pointer-events-none absolute -right-32 -top-48 h-[520px] w-[520px] rounded-full border border-white/[0.06] bg-white/[0.03]" />
          <div className="relative mx-auto max-w-[1120px]">
            <div className="max-w-3xl">
              <div className="mb-4 font-body text-xs font-bold uppercase tracking-[0.2em] text-gold-300">Une question avant de réserver ?</div>
              <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">Parlons de votre projet équestre</h1>
              <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-white/65 sm:text-lg">Stage, balade, cours à l’année, anniversaire ou groupe : donnez-nous quelques informations et nous vous orienterons vers la formule la plus adaptée.</p>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white no-underline backdrop-blur-sm transition-colors hover:bg-white/10">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gold-400 text-blue-950"><Phone size={20} /></div>
                <div><div className="font-body text-[10px] font-bold uppercase tracking-wide text-white/35">Appeler</div><div className="mt-1 font-body text-sm font-bold text-white">{phone}</div></div>
              </a>
              <a href={`mailto:${email}`} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white no-underline backdrop-blur-sm transition-colors hover:bg-white/10">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300"><Mail size={20} /></div>
                <div className="min-w-0"><div className="font-body text-[10px] font-bold uppercase tracking-wide text-white/35">Écrire</div><div className="mt-1 truncate font-body text-sm font-bold text-white">{email}</div></div>
              </a>
              <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white no-underline backdrop-blur-sm transition-colors hover:bg-white/10">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300"><Navigation size={20} /></div>
                <div><div className="font-body text-[10px] font-bold uppercase tracking-wide text-white/35">Itinéraire</div><div className="mt-1 font-body text-sm font-bold text-white">Agon-Coutainville</div></div>
              </a>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div>
              <div className="font-body text-xs font-bold uppercase tracking-[0.18em] text-gold-500">Informations pratiques</div>
              <h2 className="mt-3 font-display text-3xl font-bold text-blue-950">Venez nous rencontrer</h2>
              <p className="mt-4 font-body text-sm leading-relaxed text-slate-500">Le centre se trouve à environ {SITE_CONFIG.distanceToBeach} de la mer, à proximité des dunes et du littoral d’Agon-Coutainville.</p>

              <div className="mt-8 divide-y divide-slate-100 rounded-[24px] border border-blue-500/[0.08] bg-white px-5 shadow-[0_15px_45px_rgba(12,26,46,0.05)]">
                <div className="flex gap-4 py-5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MapPin size={20} /></div>
                  <div><div className="font-body text-xs font-bold text-blue-950">Adresse</div><div className="mt-1 font-body text-sm leading-relaxed text-slate-500">{street}<br />{zipCity}</div></div>
                </div>
                <div className="flex gap-4 py-5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Phone size={20} /></div>
                  <div><div className="font-body text-xs font-bold text-blue-950">Téléphone</div><a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-1 block font-body text-sm text-slate-500 no-underline hover:text-blue-600">{phone}</a>{secondaryPhone && <a href={`tel:${secondaryPhone.replace(/\s/g, "")}`} className="mt-1 block font-body text-sm text-slate-500 no-underline hover:text-blue-600">{secondaryPhone}</a>}</div>
                </div>
                <div className="flex gap-4 py-5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Mail size={20} /></div>
                  <div className="min-w-0"><div className="font-body text-xs font-bold text-blue-950">Email</div><a href={`mailto:${email}`} className="mt-1 block break-all font-body text-sm text-slate-500 no-underline hover:text-blue-600">{email}</a></div>
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-blue-500/[0.08] bg-white p-5 shadow-[0_15px_45px_rgba(12,26,46,0.05)]">
                <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold-50 text-gold-600"><Clock3 size={19} /></div><div><div className="font-display text-lg font-bold text-blue-950">Horaires indicatifs</div><div className="font-body text-xs text-slate-400">L’activité du centre varie selon la saison</div></div></div>
                <div className="divide-y divide-slate-100">
                  {Object.values(SCHEDULE).map((schedule) => (
                    <div key={schedule.period} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="font-body text-xs font-semibold text-slate-500">{schedule.period}</div>
                      <div className={`text-right font-body text-xs font-bold ${schedule.days === "Fermé" ? "text-red-500" : "text-blue-700"}`}>{schedule.days}<br /><span className="font-medium text-slate-400">{schedule.hours}</span></div>
                    </div>
                  ))}
                </div>
              </div>

              <a href={SITE_CONFIG.social.facebook} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-5 py-3 font-body text-xs font-bold text-blue-700 no-underline hover:border-blue-200"><Facebook size={16} /> Suivre la vie du club sur Facebook</a>
            </div>

            <ContactForm />
          </div>
        </section>

        <section className="px-5 pb-12 sm:px-6">
          <div className="mx-auto max-w-[1120px]">
            <IllustratedFeatureBand
              image="/images/vitrine/choices/balade-plage.webp"
              alt="Une cavalière se promène à poney sur la plage d'Agon-Coutainville"
              eyebrow="Entre campagne et littoral"
              title="Le centre est à quelques minutes des dunes et de la plage"
              text="Profitez de votre venue pour découvrir Agon-Coutainville. Les activités extérieures sont organisées selon la météo, les marées et le niveau des cavaliers."
              href="/planning"
              cta="Voir les prochaines activités"
              tone="orange"
              compact
            />
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-6">
          <div className="mx-auto max-w-[1120px] overflow-hidden rounded-[26px] border border-blue-500/[0.08] bg-white shadow-[0_18px_55px_rgba(12,26,46,0.07)]">
            <iframe
              title="Carte du Centre Équestre d’Agon-Coutainville"
              src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
              className="h-[360px] w-full border-0 sm:h-[430px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-display text-lg font-bold text-blue-950">Centre Équestre d’Agon-Coutainville</div><div className="mt-1 font-body text-xs text-slate-400">{street}, {zipCity}</div></div>
              <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-body text-xs font-bold text-white no-underline"><Navigation size={15} /> Ouvrir l’itinéraire</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
