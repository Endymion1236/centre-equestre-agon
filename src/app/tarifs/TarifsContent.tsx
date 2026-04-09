"use client";
import { useVitrine } from "@/lib/use-vitrine";
import { BadgeEuro } from "lucide-react";
import { SectionHeader } from "@/components/ui";

function PriceCard({ title, subtitle, price, unit, features, highlight }: {
  title: string; subtitle?: string; price: string; unit?: string;
  features?: string[]; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-6 flex flex-col gap-3 ${highlight ? "bg-blue-800 text-white shadow-xl scale-105" : "bg-white border border-blue-500/8"}`}>
      <div className={`font-display text-lg font-bold ${highlight ? "text-white" : "text-blue-800"}`}>{title}</div>
      {subtitle && <div className={`font-body text-xs ${highlight ? "text-white/60" : "text-gray-400"}`}>{subtitle}</div>}
      <div className="flex items-end gap-1 mt-1">
        <span className={`font-display text-3xl font-bold ${highlight ? "text-gold-300" : "text-blue-500"}`}>{price}</span>
        {unit && <span className={`font-body text-sm mb-1 ${highlight ? "text-white/60" : "text-gray-400"}`}>{unit}</span>}
      </div>
      {features && (
        <ul className="flex flex-col gap-1.5 mt-2">
          {features.map((f, i) => (
            <li key={i} className={`font-body text-xs flex items-center gap-2 ${highlight ? "text-white/80" : "text-gray-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${highlight ? "bg-gold-300" : "bg-blue-400"}`} />{f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TarifsContent() {
  const { vitrine } = useVitrine();
  const t = vitrine.tarifs;
  const s = t.stages as any;

  return (
    <>
      {/* Stages */}
      <section className="py-16 px-6 max-w-[1100px] mx-auto">
        <SectionHeader tag="Stages vacances" title="Tarifs des stages"
          subtitle="Du lundi au vendredi, 2h par jour. Tarifs identiques toutes périodes." />
        <div className="flex flex-wrap gap-5 justify-center">
          <PriceCard title="Baby Poney" subtitle="3 – 5 ans" price={`${s.baby_poney}€`} unit="/ semaine"
            features={["10h de stage (2h/jour)", "Max 6 enfants", "Thèmes imaginaires", "Encadrement BPJEPS"]} />
          <PriceCard title="Galop Bronze / Argent" subtitle="6 – 10 ans" price={`${s.galop_bronze_argent}€`} unit="/ semaine" highlight
            features={["10h de stage (2h/jour)", "Semaines thématiques", "Soins aux poneys inclus", "Passage galops possible", "Goûter inclus"]} />
          <PriceCard title="Galop d'Or / G3-4" subtitle="8+ ans" price={`${s.galop_or}€`} unit="/ semaine"
            features={["10h de stage (2h/jour)", "Multi-disciplines", "CSO, dressage, cross", "Préparation galops FFE"]} />
        </div>
      </section>

      {/* Balades */}
      <section className="py-16 px-6">
        <div className="max-w-[700px] mx-auto bg-sand rounded-3xl p-8 md:p-10">
          <SectionHeader tag="Balades à la plage" title="Tarifs des promenades"
            subtitle="Toutes nos balades durent 2h. Groupes par niveau." />
          <div className="flex flex-col gap-3">
            {t.balades.map((b, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-blue-500/8 last:border-b-0">
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{b.label}</div>
                  <div className="font-body text-xs text-gray-400">{b.level} · {b.note}</div>
                </div>
                <div className="font-display text-xl font-bold text-blue-500">{b.price}€</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compétitions */}
      <section className="py-16 px-6 max-w-[700px] mx-auto">
        <SectionHeader tag="Compétitions internes" title="Challenges & concours" subtitle="" />
        <div className="flex flex-col gap-3">
          {t.competitions.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-blue-500/8 last:border-b-0">
              <div>
                <div className="font-body text-sm font-semibold text-blue-800">{c.label}</div>
                <div className="font-body text-xs text-gray-400">{c.level} · {c.freq}</div>
              </div>
              <div className="font-display text-xl font-bold text-blue-500">{c.price}€</div>
            </div>
          ))}
        </div>
        {t.forfaits_note && <p className="font-body text-sm text-gray-400 mt-6 text-center italic">{t.forfaits_note}</p>}
      </section>

      {/* Note paiement */}
      {t.paiement_note && (
        <section className="py-8 px-6">
          <div className="max-w-[600px] mx-auto text-center">
            <div className="flex items-center justify-center gap-2 font-body text-sm text-blue-800">
              <BadgeEuro size={18} className="text-blue-500" />
              {t.paiement_note}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
