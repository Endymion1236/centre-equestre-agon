"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { MANUAL, type ManualChapter, type ManualSection } from "@/lib/manual-content";
import { startTour, isTourNew } from "@/lib/manual-tours";
import {
  Sparkles, Users, Calendar, CreditCard, Heart, ClipboardList, BookOpen,
  Mail, Lightbulb, Search, ExternalLink, Play, ChevronRight, BookMarked,
} from "lucide-react";

const ICONS: Record<string, any> = {
  Sparkles, Users, Calendar, CreditCard, Heart, ClipboardList, BookOpen, Mail, Lightbulb,
};

export default function ManuelPage() {
  const [activeChapter, setActiveChapter] = useState<string>(MANUAL[0].id);
  const [search, setSearch] = useState("");

  // Hash → ouvre le chapitre correspondant au chargement
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!hash) return;
    // hash peut être "chapitreId" ou "chapitreId/sectionId"
    const [chapId] = hash.split("/");
    if (MANUAL.some(c => c.id === chapId)) {
      setActiveChapter(chapId);
    }
  }, []);

  // Recherche : filtre les sections par titre/texte
  const filteredChapters = useMemo(() => {
    if (!search.trim()) return MANUAL;
    const q = search.toLowerCase();
    return MANUAL
      .map(ch => ({
        ...ch,
        sections: ch.sections.filter(s =>
          s.title.toLowerCase().includes(q) ||
          s.text.toLowerCase().includes(q)
        ),
      }))
      .filter(ch =>
        ch.title.toLowerCase().includes(q) ||
        ch.summary.toLowerCase().includes(q) ||
        ch.sections.length > 0
      );
  }, [search]);

  const currentChapter = filteredChapters.find(c => c.id === activeChapter) || filteredChapters[0];

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-2">
        <BookMarked size={28} className="text-blue-500" />
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Manuel utilisateur</h1>
          <p className="font-body text-sm text-slate-500">Guide complet de la plateforme — avec tours guidés interactifs.</p>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="relative my-5 max-w-lg">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher dans le manuel..."
          className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* Sommaire latéral */}
        <aside className="md:sticky md:top-4 md:self-start">
          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Chapitres</div>
          <nav className="flex flex-col gap-1">
            {filteredChapters.map(ch => {
              const Icon = ICONS[ch.icon] || Sparkles;
              const isActive = ch.id === (currentChapter?.id || "");
              return (
                <button
                  key={ch.id}
                  onClick={() => { setActiveChapter(ch.id); window.history.replaceState(null, "", `#${ch.id}`); }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-none cursor-pointer text-left font-body text-sm transition-colors ${
                    isActive ? "bg-blue-500 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}>
                  <Icon size={15} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{ch.title}</span>
                  {search && ch.sections.length > 0 && (
                    <span className={`font-body text-[10px] px-1.5 rounded ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>
                      {ch.sections.length}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredChapters.length === 0 && (
              <p className="font-body text-xs text-slate-500 italic px-3 py-2">Aucun résultat</p>
            )}
          </nav>
        </aside>

        {/* Contenu */}
        <div className="min-w-0">
          {currentChapter ? (
            <ChapterView chapter={currentChapter} />
          ) : (
            <Card padding="lg" className="text-center">
              <p className="font-body text-sm text-slate-500">Aucun résultat.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterView({ chapter }: { chapter: ManualChapter }) {
  const Icon = ICONS[chapter.icon] || Sparkles;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 pb-3 border-b border-gray-100">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-blue-500" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold text-blue-800">{chapter.title}</h2>
          <p className="font-body text-sm text-slate-500 mt-0.5">{chapter.summary}</p>
        </div>
      </div>

      {chapter.sections.map(section => (
        <SectionView key={section.id} section={section} chapterId={chapter.id} />
      ))}
    </div>
  );
}

function SectionView({ section, chapterId }: { section: ManualSection; chapterId: string }) {
  const anchorId = `${chapterId}-${section.id}`;
  const tourNew = section.tourId ? isTourNew(section.tourId) : false;
  return (
    <div id={anchorId}>
    <Card padding="md">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="font-display text-base font-bold text-blue-800 flex items-center gap-2">
          <ChevronRight size={16} className="text-blue-400" />
          {section.title}
        </h3>
        <div className="flex items-center gap-2">
          {section.tourId && (
            <button
              onClick={() => startTour(section.tourId!)}
              className="flex items-center gap-1.5 font-body text-xs text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg border-none cursor-pointer">
              <Play size={12} />
              Lancer le tour
              {tourNew && <span className="bg-orange-400 text-white text-[9px] px-1.5 py-0.5 rounded-full font-semibold">NEW</span>}
            </button>
          )}
          {section.href && (
            <Link href={section.href}
              className="flex items-center gap-1.5 font-body text-xs text-blue-500 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg no-underline">
              Ouvrir
              <ExternalLink size={11} />
            </Link>
          )}
        </div>
      </div>

      <div
        className="font-body text-sm text-slate-700 leading-relaxed manual-content"
        dangerouslySetInnerHTML={{ __html: section.text }}
      />

      {section.screenshot && (
        <div className="mt-4 rounded-lg overflow-hidden border border-gray-100 bg-slate-50">
          <img
            src={section.screenshot}
            alt={section.title}
            className="w-full h-auto block"
            loading="lazy"
            onError={e => {
              // Si l'image n'existe pas encore, on affiche un placeholder
              (e.target as HTMLImageElement).style.display = "none";
              const parent = (e.target as HTMLImageElement).parentElement;
              if (parent) {
                parent.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#94a3b8;font-family:sans-serif;font-size:12px;">📷 Capture d'écran à ajouter : <code>${section.screenshot}</code></div>`;
              }
            }}
          />
        </div>
      )}

      {section.tips && section.tips.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="font-body text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">💡 Astuces</div>
          <ul className="list-none p-0 m-0 flex flex-col gap-1">
            {section.tips.map((tip, i) => (
              <li key={i} className="font-body text-xs text-amber-800 leading-relaxed">
                • {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      <style jsx global>{`
        .manual-content ul, .manual-content ol { padding-left: 20px; margin: 8px 0; }
        .manual-content li { margin: 4px 0; }
        .manual-content p { margin: 6px 0; }
        .manual-content code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
        .manual-content strong { color: #1e3a5f; }
        .manual-content kbd {
          background: #f1f5f9; border: 1px solid #cbd5e1; border-bottom-width: 2px;
          padding: 1px 5px; border-radius: 3px; font-size: 11px; font-family: monospace;
        }
      `}</style>
    </Card>
    </div>
  );
}
