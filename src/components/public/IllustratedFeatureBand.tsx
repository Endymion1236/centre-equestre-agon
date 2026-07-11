import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Tone = "blue" | "pink" | "amber" | "emerald" | "orange";

type IllustratedFeatureBandProps = {
  image: string;
  alt: string;
  eyebrow: string;
  title: string;
  text: string;
  href?: string;
  cta?: string;
  tone?: Tone;
  compact?: boolean;
  className?: string;
};

const tones: Record<Tone, {
  shell: string;
  wash: string;
  eyebrow: string;
  button: string;
}> = {
  blue: {
    shell: "border-blue-100 bg-blue-50",
    wash: "from-blue-50 via-blue-50/92 to-blue-50/5",
    eyebrow: "text-blue-700",
    button: "bg-blue-700 text-white hover:bg-blue-600",
  },
  pink: {
    shell: "border-pink-100 bg-pink-50",
    wash: "from-pink-50 via-pink-50/92 to-pink-50/5",
    eyebrow: "text-pink-700",
    button: "bg-pink-600 text-white hover:bg-pink-500",
  },
  amber: {
    shell: "border-amber-100 bg-amber-50",
    wash: "from-amber-50 via-amber-50/92 to-amber-50/5",
    eyebrow: "text-amber-700",
    button: "bg-amber-600 text-white hover:bg-amber-500",
  },
  emerald: {
    shell: "border-emerald-100 bg-emerald-50",
    wash: "from-emerald-50 via-emerald-50/92 to-emerald-50/5",
    eyebrow: "text-emerald-700",
    button: "bg-emerald-700 text-white hover:bg-emerald-600",
  },
  orange: {
    shell: "border-orange-100 bg-orange-50",
    wash: "from-orange-50 via-orange-50/92 to-orange-50/5",
    eyebrow: "text-orange-700",
    button: "bg-orange-600 text-white hover:bg-orange-500",
  },
};

export default function IllustratedFeatureBand({
  image,
  alt,
  eyebrow,
  title,
  text,
  href,
  cta = "Découvrir",
  tone = "blue",
  compact = false,
  className = "",
}: IllustratedFeatureBandProps) {
  const theme = tones[tone];
  const minHeight = compact ? "min-h-[270px]" : "min-h-[330px]";
  const contentWidth = compact ? "max-w-[62%] sm:max-w-[56%]" : "max-w-[68%] sm:max-w-[58%]";

  return (
    <div className={`group relative overflow-hidden rounded-[30px] border shadow-[0_18px_55px_rgba(12,26,46,0.07)] ${theme.shell} ${minHeight} ${className}`}>
      <img
        src={image}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.02]"
      />
      <div className={`absolute inset-0 bg-gradient-to-r ${theme.wash}`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/18 via-transparent to-white/8" />

      <div className={`relative z-10 flex ${minHeight} ${contentWidth} flex-col justify-center p-6 sm:p-8`}>
        <div className={`font-body text-[10px] font-bold uppercase tracking-[0.17em] ${theme.eyebrow}`}>{eyebrow}</div>
        <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-blue-950 sm:text-3xl">{title}</h2>
        <p className="mt-4 font-body text-sm leading-relaxed text-slate-600 sm:text-base">{text}</p>
        {href && (
          <Link href={href} className={`mt-6 inline-flex w-fit items-center gap-2 rounded-xl px-5 py-3.5 font-body text-sm font-bold no-underline shadow-[0_8px_24px_rgba(12,26,46,0.11)] transition-all hover:-translate-y-0.5 ${theme.button}`}>
            {cta} <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        )}
      </div>
    </div>
  );
}
