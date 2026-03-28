"use client";
import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import type { Activity } from "@/types";

interface Props {
  activities: Activity[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export default function ActivityPicker({ activities, value, onChange, className = "" }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = activities.filter(a => a.active !== false);
  const selected = active.find(a => a.id === value);

  const filtered = search.trim()
    ? active.filter(a => a.title.toLowerCase().includes(search.toLowerCase().trim()))
    : active;

  // Fermer si clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (a: Activity) => {
    onChange(a.id);
    setSearch("");
    setOpen(false);
  };

  const clear = () => { onChange(""); setSearch(""); };

  const inp = `w-full px-3 py-2.5 rounded-lg border font-body text-sm bg-cream focus:outline-none ${className}`;

  return (
    <div ref={ref} className="relative">
      {/* Champ de saisie/recherche */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-cream cursor-pointer ${open ? "border-blue-500" : "border-blue-500/8"}`}
        onClick={() => setOpen(o => !o)}>
        <Search size={14} className="text-slate-400 flex-shrink-0"/>
        {open ? (
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            onClick={e => e.stopPropagation()}
            placeholder="Rechercher une activité..."
            className="flex-1 bg-transparent border-none outline-none font-body text-sm text-blue-800 placeholder:text-slate-400"/>
        ) : (
          <span className={`flex-1 font-body text-sm ${selected ? "text-blue-800" : "text-slate-400"}`}>
            {selected ? selected.title : "Activité..."}
          </span>
        )}
        {selected && !open && (
          <button onClick={e => { e.stopPropagation(); clear(); }}
            className="text-slate-400 hover:text-red-400 bg-transparent border-none cursor-pointer p-0 flex-shrink-0">
            <X size={14}/>
          </button>
        )}
      </div>

      {/* Liste déroulante */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-blue-500/15 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 font-body text-sm text-slate-400 text-center">Aucune activité trouvée</div>
          ) : (
            filtered.map((a, i) => (
              <button key={`${a.id}-${i}`} onClick={() => select(a)}
                className={`w-full text-left px-3 py-2.5 font-body text-sm border-none cursor-pointer flex items-center gap-2
                  ${a.id === value ? "bg-blue-50 text-blue-700 font-semibold" : "text-blue-800 hover:bg-sand bg-white"}
                  ${i > 0 ? "border-t border-gray-50" : ""}`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: (a as any).color || "#2050A0" }}/>
                {a.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
