"use client";

/**
 * Visage de la borne — Rive avec secours SVG automatique.
 *
 * Le composant tente de charger /calin.riv (dossier public/). Si le fichier
 * est absent ou invalide, il bascule sans erreur sur le poney SVG : on peut
 * donc déployer l'intégration Rive AVANT d'avoir créé l'animation, et la
 * brancher plus tard en déposant simplement le fichier.
 *
 * Contrat attendu du fichier Rive (éditeur rive.app) :
 * - Artboard : « Calin »  (ou l'artboard par défaut)
 * - State machine : « Borne »
 * - Entrées de la state machine :
 *     ecoute    (Boolean) — la borne écoute le visiteur
 *     reflexion (Boolean) — la borne réfléchit / cherche dans le planning
 *     parle     (Boolean) — la borne est en train de répondre
 *     bouche    (Number 0..100) — ouverture de la bouche, pilotée en direct
 *                                 par l'amplitude audio réelle
 *   (aucune entrée active = état repos ; à gérer dans la state machine :
 *    clignements et respiration en boucle d'inactivité)
 *
 * L'ouverture de bouche est poussée à ~60 fps par la page via la ref
 * impérative setBouche(0..1) — jamais par un re-render React.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

export type EtatVisage = "off" | "connecting" | "idle" | "listening" | "thinking" | "speaking";

export interface BorneVisageHandle {
  /** Ouverture de la bouche, 0 (fermée) à 1 (grande ouverte). */
  setBouche: (v: number) => void;
}

const RIVE_SRC = "/calin.riv";
const STATE_MACHINE = "Borne";

// ── Version Rive ──────────────────────────────────────────────────────────────

const VisageRive = forwardRef<BorneVisageHandle, { etat: EtatVisage; onErreur: () => void }>(
  function VisageRive({ etat, onErreur }, ref) {
    const { rive, RiveComponent } = useRive({
      src: RIVE_SRC,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      onLoadError: () => onErreur(),
    });

    const ecoute = useStateMachineInput(rive, STATE_MACHINE, "ecoute");
    const reflexion = useStateMachineInput(rive, STATE_MACHINE, "reflexion");
    const parle = useStateMachineInput(rive, STATE_MACHINE, "parle");
    const bouche = useStateMachineInput(rive, STATE_MACHINE, "bouche");
    const boucheRef = useRef(bouche);
    boucheRef.current = bouche;

    useEffect(() => {
      if (ecoute) ecoute.value = etat === "listening";
      if (reflexion) reflexion.value = etat === "thinking";
      if (parle) parle.value = etat === "speaking";
    }, [etat, ecoute, reflexion, parle]);

    useImperativeHandle(ref, () => ({
      setBouche: (v: number) => {
        const input = boucheRef.current;
        if (input) input.value = Math.max(0, Math.min(100, Math.round(v * 100)));
      },
    }), []);

    return <RiveComponent className="w-full h-full" />;
  }
);

// ── Version illustrée (poses générées par IA, découpées et détourées) ────────

type PoseKey = "idle" | "parle1" | "parle2" | "dodo" | "ecoute" | "pensif";
const POSES: PoseKey[] = ["idle", "parle1", "parle2", "dodo", "ecoute", "pensif"];

/**
 * Visage illustré : six poses pré-dessinées (/borne/calin-*.webp) fondues
 * entre elles. La bouche pendant la parole est choisie en direct par
 * l'amplitude audio (fermée / entrouverte / grande ouverte) via des
 * manipulations de style impératives — jamais de re-render à 60 fps.
 */
const VisagePhoto = forwardRef<BorneVisageHandle, { etat: EtatVisage; onErreur: () => void }>(
  function VisagePhoto({ etat, onErreur }, ref) {
    const imgRefs = useRef<Partial<Record<PoseKey, HTMLImageElement | null>>>({});
    const poseCouranteRef = useRef<PoseKey>("dodo");
    const squashRef = useRef<HTMLDivElement | null>(null);
    // Amplitude lissée : attaque rapide (la bouche s'ouvre tout de suite),
    // relâchement lent (elle se referme en douceur) — supprime le
    // papillonnement dû aux micro-variations de la voix
    const ampLisseeRef = useRef(0);
    const etatRef = useRef(etat);
    etatRef.current = etat;

    const montrer = (pose: PoseKey) => {
      if (poseCouranteRef.current === pose) return;
      poseCouranteRef.current = pose;
      for (const k of POSES) {
        const el = imgRefs.current[k];
        if (el) el.style.opacity = k === pose ? "1" : "0";
      }
    };

    // Pose selon l'état + clignements en idle/écoute + réveil animé
    useEffect(() => {
      let timers: ReturnType<typeof setTimeout>[] = [];
      let intervalle: ReturnType<typeof setInterval> | null = null;

      if (etat === "off") montrer("dodo");
      else if (etat === "connecting") {
        // Réveil : paupières qui papillonnent
        let ouvert = false;
        montrer("dodo");
        intervalle = setInterval(() => { ouvert = !ouvert; montrer(ouvert ? "idle" : "dodo"); }, 380);
      } else if (etat === "listening") montrer("ecoute");
      else if (etat === "thinking") montrer("pensif");
      else if (etat === "speaking") montrer("parle1");
      else {
        montrer("idle");
        // Clignements : 2,5 à 6 s, via la pose yeux fermés
        const planifierClin = () => {
          const t = setTimeout(() => {
            if (etatRef.current !== "idle") return;
            montrer("dodo");
            timers.push(setTimeout(() => {
              if (etatRef.current === "idle") montrer("idle");
              planifierClin();
            }, 130));
          }, 2500 + Math.random() * 3500);
          timers.push(t);
        };
        planifierClin();
      }
      return () => { timers.forEach(clearTimeout); if (intervalle) clearInterval(intervalle); };
    }, [etat]);

    useImperativeHandle(ref, () => ({
      setBouche: (v: number) => {
        if (etatRef.current !== "speaking") {
          ampLisseeRef.current = 0;
          if (squashRef.current) squashRef.current.style.transform = "";
          return;
        }
        // Lissage asymétrique : montée immédiate, descente progressive
        const prev = ampLisseeRef.current;
        const lisse = v > prev ? prev + (v - prev) * 0.65 : prev * 0.82;
        ampLisseeRef.current = lisse;

        // Squash & stretch : la tête "pulse" imperceptiblement avec la voix
        // (60 fps continus) — c'est ce mouvement permanent qui donne la
        // fluidité entre deux dessins de bouche, comme en animation classique
        if (squashRef.current) {
          const s = 1 + lisse * 0.022;
          squashRef.current.style.transform = `scaleY(${s.toFixed(4)}) translateY(${(-lisse * 2).toFixed(2)}px)`;
        }

        const actuelle = poseCouranteRef.current;
        if (lisse > 0.4) montrer("parle2");
        else if (lisse > 0.12) { if (actuelle !== "parle2" || lisse < 0.3) montrer("parle1"); }
        else if (actuelle !== "idle" && lisse < 0.07) montrer("idle");
      },
    }), []);

    const ecoute = etat === "listening";
    const reflechit = etat === "thinking";

    return (
      <div className="relative w-full h-full">
        <style>{`
          .borne-photo-bob { animation: borne-photo-bob 4.2s ease-in-out infinite; }
          @keyframes borne-photo-bob { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(5px); } }
        `}</style>
        <div
          className="borne-photo-bob relative w-full h-full transition-transform duration-500"
          style={{
            transform: ecoute ? "rotate(-2deg) scale(1.03)" : reflechit ? "rotate(1.5deg)" : undefined,
            // Fondu du bas : la découpe coupe le cou net, on l'estompe
            WebkitMaskImage: "linear-gradient(to bottom, black 82%, transparent 99%)",
            maskImage: "linear-gradient(to bottom, black 82%, transparent 99%)",
          }}
        >
          <div ref={squashRef} className="relative w-full h-full" style={{ transformOrigin: "50% 78%", willChange: "transform" }}>
          {POSES.map((pose, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={pose}
              ref={(el) => { imgRefs.current[pose] = el; }}
              src={`/borne/calin-${pose}.webp`}
              alt=""
              draggable={false}
              onError={i === 0 ? onErreur : undefined}
              className="absolute inset-0 w-full h-full object-contain select-none"
              style={{ opacity: pose === "dodo" ? 1 : 0, transition: "opacity 70ms ease-out" }}
            />
          ))}
          </div>
        </div>
      </div>
    );
  }
);

// ── Version SVG (secours) ─────────────────────────────────────────────────────

const VisageSvg = forwardRef<BorneVisageHandle, { etat: EtatVisage }>(
  function VisageSvg({ etat }, ref) {
    const mouthRef = useRef<SVGEllipseElement | null>(null);
    const [blink, setBlink] = useState(false);
    const [regard, setRegard] = useState({ x: 0, y: 0 });
    const [flick, setFlick] = useState(false);

    // Clignement des yeux — toutes les 2,5 à 6 s (double clin parfois)
    useEffect(() => {
      let timer: ReturnType<typeof setTimeout>;
      const planifier = () => {
        timer = setTimeout(() => {
          setBlink(true);
          setTimeout(() => {
            setBlink(false);
            // Un double clin une fois sur quatre — plus vivant
            if (Math.random() < 0.25) {
              setTimeout(() => {
                setBlink(true);
                setTimeout(() => { setBlink(false); planifier(); }, 110);
              }, 160);
            } else planifier();
          }, 110);
        }, 2500 + Math.random() * 3500);
      };
      planifier();
      return () => clearTimeout(timer);
    }, []);

    // Regard : balaie doucement la pièce au repos, se fixe sur le visiteur
    // pendant l'écoute, se lève pendant la réflexion
    useEffect(() => {
      if (etat === "listening" || etat === "speaking") { setRegard({ x: 0, y: 0 }); return; }
      if (etat === "thinking") { setRegard({ x: 3, y: -6 }); return; }
      setRegard({ x: 0, y: 0 });
      const timer = setInterval(() => {
        setRegard({ x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 5 });
      }, 2200 + Math.random() * 2500);
      return () => clearInterval(timer);
    }, [etat]);

    // Petit frétillement d'oreilles spontané au repos
    useEffect(() => {
      if (etat !== "idle" && etat !== "off") return;
      const timer = setInterval(() => {
        setFlick(true);
        setTimeout(() => setFlick(false), 1400);
      }, 7000 + Math.random() * 6000);
      return () => clearInterval(timer);
    }, [etat]);

    useImperativeHandle(ref, () => ({
      setBouche: (v: number) => {
        const c = Math.max(0, Math.min(1, v));
        const m = mouthRef.current;
        if (!m) return;
        // La bouche s'ouvre en hauteur ET s'élargit légèrement — plus naturel
        m.setAttribute("ry", String(Math.round(3 + c * 32)));
        m.setAttribute("rx", String(Math.round(16 + c * 7)));
      },
    }), []);

    const ecoute = etat === "listening";
    const reflechit = etat === "thinking";
    const reveil = etat === "connecting";
    const endormi = etat === "off" || reveil;
    const eyeRy = ecoute ? 12.5 : 10.5;
    const browLift = ecoute ? 5 : reflechit ? 3 : 0;

    return (
      <svg viewBox="0 0 240 240" className="w-full h-full" aria-hidden="true">
        <defs>
          <radialGradient id="borne-halo" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#DCE9FF" />
            <stop offset="100%" stopColor="#EEF4FF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="borne-robe" cx="42%" cy="34%" r="75%">
            <stop offset="0%" stopColor="#FFEFD8" />
            <stop offset="70%" stopColor="#F6D9AC" />
            <stop offset="100%" stopColor="#EAC28C" />
          </radialGradient>
          <linearGradient id="borne-criniere" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A5713A" />
            <stop offset="100%" stopColor="#7A4E22" />
          </linearGradient>
          <radialGradient id="borne-museau" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#FFF7EA" />
            <stop offset="100%" stopColor="#F7E3C4" />
          </radialGradient>
          <style>{`
            .borne-bob { animation: borne-bob 4.2s ease-in-out infinite; transform-origin: 120px 130px; }
            .borne-tilt { transition: transform 0.55s cubic-bezier(.34,1.3,.6,1); transform-origin: 120px 132px; }
            .borne-oreille-g { transform-origin: 70px 58px; }
            .borne-oreille-d { transform-origin: 170px 58px; }
            .borne-ecoute .borne-oreille-g { animation: borne-twitch-g 1.6s ease-in-out infinite; }
            .borne-ecoute .borne-oreille-d { animation: borne-twitch-d 1.6s ease-in-out infinite 0.3s; }
            .borne-oeil { transition: transform 0.09s ease; }
            .borne-regard { transition: transform 0.65s cubic-bezier(.4,.1,.3,1); }
            .borne-sourcil, .borne-paupiere-trait { transition: d 0.3s ease; }
            @keyframes borne-bob { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(4px); } }
            .borne-reveil-anim { animation: borne-reveil 1.1s ease-in-out infinite; transform-origin: 120px 132px; }
            @keyframes borne-reveil { 0%,100% { transform: rotate(-2.5deg) scale(1); } 35% { transform: rotate(2.5deg) scale(1.015); } 70% { transform: rotate(-1deg) scale(1); } }
            .borne-flutter { animation: borne-flutter 0.7s ease-in-out infinite; }
            @keyframes borne-flutter { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-2px); } }
            @keyframes borne-twitch-g { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-7deg); } }
            @keyframes borne-twitch-d { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(7deg); } }
          `}</style>
        </defs>

        <circle cx="120" cy="118" r="114" fill="url(#borne-halo)" />

        {/* Inclinaison de tête attentive quand il écoute (couche séparée du
            balancement : deux transforms CSS ne peuvent pas cohabiter sur le
            même élément) */}
        <g className={`borne-tilt ${reveil ? "borne-reveil-anim" : ""}`}
          style={reveil ? undefined : { transform: ecoute ? "rotate(-2.5deg)" : reflechit ? "rotate(1.5deg)" : "rotate(0deg)" }}>
          <g className={`borne-bob ${ecoute || flick ? "borne-ecoute" : ""}`}>
            <g className="borne-oreille-g">
              <path d="M62 66 Q44 16 84 30 Q96 50 78 70 Z" fill="url(#borne-robe)" stroke="#4A3118" strokeWidth="3" strokeLinejoin="round" />
              <path d="M67 58 Q58 26 80 36 Q86 48 76 60 Z" fill="#F2B8C6" />
            </g>
            <g className="borne-oreille-d">
              <path d="M178 66 Q196 16 156 30 Q144 50 162 70 Z" fill="url(#borne-robe)" stroke="#4A3118" strokeWidth="3" strokeLinejoin="round" />
              <path d="M173 58 Q182 26 160 36 Q154 48 164 60 Z" fill="#F2B8C6" />
            </g>

            <ellipse cx="120" cy="126" rx="92" ry="90" fill="url(#borne-robe)" stroke="#4A3118" strokeWidth="3" />
            <path d="M108 40 Q120 34 132 40 Q130 84 126 112 Q120 120 114 112 Q110 84 108 40 Z" fill="#FFF8EC" opacity="0.9" />

            {/* Crinière : une seule forme pleine qui épouse le crâne, bord
                inférieur en festons — remplace les mèches éparses qui
                ressemblaient à des brindilles */}
            <path d="M56 78 Q60 34 120 26 Q180 34 184 78 Q174 62 162 72 Q152 54 140 66 Q130 48 120 62 Q110 48 100 66 Q88 54 78 72 Q66 62 56 78 Z"
              fill="url(#borne-criniere)" stroke="#5C3A18" strokeWidth="2.5" strokeLinejoin="round" />
            {/* Toupet qui retombe sur la liste */}
            <path d="M106 52 Q120 44 134 52 Q130 78 120 86 Q110 78 106 52 Z"
              fill="url(#borne-criniere)" stroke="#5C3A18" strokeWidth="2.5" strokeLinejoin="round" />

            <path className="borne-sourcil" d={`M80 ${76 - browLift} Q92 ${68 - browLift} 103 ${75 - browLift}`}
              stroke="#5C3A18" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <path className="borne-sourcil" d={`M137 ${75 - browLift} Q148 ${68 - browLift} 160 ${76 - browLift}`}
              stroke="#5C3A18" strokeWidth="4.5" fill="none" strokeLinecap="round" />

            {endormi ? (
              <g className={reveil ? "borne-flutter" : undefined}>
                <path d="M82 96 Q91 102 100 96" stroke="#3A2A18" strokeWidth="4" fill="none" strokeLinecap="round" />
                <path d="M140 96 Q149 102 158 96" stroke="#3A2A18" strokeWidth="4" fill="none" strokeLinecap="round" />
              </g>
            ) : (
              /* Regard mobile (translation douce) + clignement (écrasement
                 vertical avec transition courte) */
              <g className="borne-regard" style={{ transform: `translate(${regard.x}px, ${regard.y}px)` }}>
                <g className="borne-oeil" style={{ transform: blink ? "scaleY(0.08)" : "scaleY(1)", transformOrigin: "91px 94px" }}>
                  <ellipse cx="91" cy="94" rx="11" ry={eyeRy} fill="#3A2A18" />
                  <circle cx="95" cy="90.5" r="3.4" fill="#fff" />
                  <circle cx="88" cy="97" r="1.6" fill="#fff" opacity="0.8" />
                </g>
                <g className="borne-oeil" style={{ transform: blink ? "scaleY(0.08)" : "scaleY(1)", transformOrigin: "149px 94px" }}>
                  <ellipse cx="149" cy="94" rx="11" ry={eyeRy} fill="#3A2A18" />
                  <circle cx="153" cy="90.5" r="3.4" fill="#fff" />
                  <circle cx="146" cy="97" r="1.6" fill="#fff" opacity="0.8" />
                </g>
              </g>
            )}

            <ellipse cx="70" cy="122" rx="12" ry="8" fill="#F6BDB2" opacity="0.65" />
            <ellipse cx="170" cy="122" rx="12" ry="8" fill="#F6BDB2" opacity="0.65" />

            <ellipse cx="120" cy="152" rx="46" ry="36" fill="url(#borne-museau)" stroke="#4A3118" strokeWidth="2.5" />
            <ellipse cx="103" cy="140" rx="4.5" ry="6" fill="#8A5A3A" opacity="0.8" transform="rotate(-14 103 140)" />
            <ellipse cx="137" cy="140" rx="4.5" ry="6" fill="#8A5A3A" opacity="0.8" transform="rotate(14 137 140)" />

            {etat === "speaking" ? (
              <ellipse ref={mouthRef} cx="120" cy="162" rx="17" ry="4" fill="#7A2E2E" stroke="#4A3118" strokeWidth="2.5" />
            ) : reflechit ? (
              <ellipse cx="120" cy="162" rx="7" ry="7" fill="#7A2E2E" stroke="#4A3118" strokeWidth="2.5" />
            ) : reveil ? (
              <ellipse cx="120" cy="162" rx="9" ry="4" fill="#7A2E2E" stroke="#4A3118" strokeWidth="2.5">
                <animate attributeName="ry" values="3;13;6;3" dur="1.7s" repeatCount="indefinite" />
                <animate attributeName="rx" values="8;12;9;8" dur="1.7s" repeatCount="indefinite" />
              </ellipse>
            ) : endormi ? (
              <path d="M104 163 Q120 167 136 163" stroke="#4A3118" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            ) : (
              <path d="M100 158 Q120 174 140 158" stroke="#4A3118" strokeWidth="4" fill="none" strokeLinecap="round" />
            )}
          </g>
        </g>
      </svg>
    );
  }
);

// ── Composant public : Rive si dispo, SVG sinon ───────────────────────────────

const BorneVisage = forwardRef<BorneVisageHandle, { etat: EtatVisage }>(
  function BorneVisage({ etat }, ref) {
    const [riveKo, setRiveKo] = useState(false);
    const [photoKo, setPhotoKo] = useState(false);
    if (!riveKo) return <VisageRive ref={ref} etat={etat} onErreur={() => setRiveKo(true)} />;
    if (!photoKo) return <VisagePhoto ref={ref} etat={etat} onErreur={() => setPhotoKo(true)} />;
    return <VisageSvg ref={ref} etat={etat} />;
  }
);

export default BorneVisage;
