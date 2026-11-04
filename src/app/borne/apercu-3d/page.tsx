"use client";
/**
 * /borne/apercu-3d — page d'essai du personnage 3D de la borne.
 *
 * Pour mettre au point /borne/calin.glb (docs/BORNE-PERSONNAGE-3D.md) sans
 * passer par une conversation : choisir l'état, faire parler la bouche,
 * jouer une expression, et lire ce que le fichier contient (animations,
 * forme de bouche, triangles, poids). Aucune donnée du club.
 */
import { useEffect, useRef, useState } from "react";
import BorneVisage3D, { type Infos3D, type Visage3DHandle } from "@/components/BorneVisage3D";
import type { EtatBorne3D } from "@/lib/borne-3d";
import { ANIMATIONS, EXPRESSIONS } from "@/lib/borne-3d";

const ETATS: [EtatBorne3D, string][] = [["idle", "Repos"], ["listening", "Écoute"], ["thinking", "Réflexion"], ["speaking", "Parle"]];
const BUDGET_OCTETS = 10 * 1024 * 1024;
const BUDGET_TRIANGLES = 60000;

export default function Apercu3D() {
  const visage = useRef<Visage3DHandle | null>(null);
  const [etat, setEtat] = useState<EtatBorne3D>("idle");
  const [infos, setInfos] = useState<Infos3D | null>(null);
  const [absent, setAbsent] = useState(false);
  const [bouche, setBouche] = useState(0);
  const [voixSimulee, setVoixSimulee] = useState(true);

  // Une « voix » simulée : la bouche bouge comme sur une vraie phrase.
  useEffect(() => {
    if (etat !== "speaking" || !voixSimulee) { visage.current?.setBouche(bouche); return; }
    let id = 0; const t0 = performance.now();
    const boucle = (t: number) => {
      const s = (t - t0) / 1000;
      const v = Math.max(0, Math.sin(s * 11) * 0.5 + Math.sin(s * 3.7) * 0.35 + 0.2) * (Math.sin(s * 0.9) > -0.6 ? 1 : 0);
      visage.current?.setBouche(v);
      id = requestAnimationFrame(boucle);
    };
    id = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(id);
  }, [etat, voixSimulee, bouche]);

  const mo = (n: number | null) => (n == null ? "?" : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);
  const attendues = Array.from(new Set(Object.values(ANIMATIONS).map((l) => l[0])));

  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white p-4 flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-h-[60vh] rounded-2xl bg-[#13243d] overflow-hidden">
        {absent
          ? <div className="h-full flex items-center justify-center text-center p-6 text-slate-300">Aucun personnage : déposez <code className="mx-1">public/borne/calin.glb</code> puis rechargez la page.</div>
          : <BorneVisage3D ref={visage} etat={etat} onErreur={() => setAbsent(true)} onInfos={setInfos} />}
      </div>
      <div className="lg:w-80 flex flex-col gap-4 text-sm">
        <div>
          <div className="font-semibold mb-2">État de la borne</div>
          <div className="grid grid-cols-2 gap-2">
            {ETATS.map(([e, l]) => (
              <button key={e} type="button" onClick={() => setEtat(e)}
                className={`px-3 py-2 rounded-lg border-none cursor-pointer ${etat === e ? "bg-amber-400 text-[#0C1A2E] font-semibold" : "bg-white/10 text-white"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="font-semibold mb-2">Bouche</div>
          <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={voixSimulee} onChange={(e) => setVoixSimulee(e.target.checked)} /> voix simulée (état « Parle »)</label>
          <input type="range" min={0} max={1} step={0.01} value={bouche} disabled={voixSimulee && etat === "speaking"}
            onChange={(e) => setBouche(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <div className="font-semibold mb-2">Expressions</div>
          <div className="flex flex-wrap gap-2">
            {EXPRESSIONS.map((x) => (
              <button key={x} type="button" onClick={() => visage.current?.setHumeur?.(x)} className="px-3 py-1.5 rounded-lg bg-white/10 text-white border-none cursor-pointer">{x}</button>
            ))}
          </div>
        </div>
        {infos && (
          <div className="rounded-xl bg-white/5 p-3 leading-relaxed">
            <div className="font-semibold mb-1">Contenu du fichier</div>
            <div>Poids : <b className={infos.octets && infos.octets > BUDGET_OCTETS ? "text-red-300" : ""}>{mo(infos.octets)}</b> (≤ 10 Mo)</div>
            <div>Triangles : <b className={infos.triangles > BUDGET_TRIANGLES ? "text-red-300" : ""}>{infos.triangles.toLocaleString("fr-FR")}</b> (≤ 60 000)</div>
            <div>Forme de bouche : <b className={infos.bouche ? "text-green-300" : "text-red-300"}>{infos.bouche ? "trouvée" : "absente (« bouche »)"}</b></div>
            <div>Caméra du fichier : {infos.camera ? "oui" : "non, cadrage automatique"}</div>
            <div className="mt-1">Animations : {infos.animations.length ? infos.animations.join(", ") : <span className="text-red-300">aucune</span>}</div>
            <div className="text-slate-400 text-xs mt-1">Attendues : {attendues.join(", ")} ; facultatives : {EXPRESSIONS.join(", ")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
