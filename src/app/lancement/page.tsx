"use client";

import { useState } from "react";
import Link from "next/link";

export default function LaunchPage() {
  const [hovered, setHovered] = useState<"equestre" | "laserbay" | null>(null);

  return (
    <div className="relative w-screen h-screen overflow-hidden flex font-sans">

      {/* ══ STYLE ══ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Raleway:wght@300;400;600;700&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        .split {
          position: relative;
          width: 50%;
          height: 100%;
          overflow: hidden;
          transition: width 0.7s cubic-bezier(0.77, 0, 0.18, 1);
          cursor: pointer;
        }
        .split:hover { width: 58%; }
        .split:has(~ .split:hover) { width: 42%; }

        .split-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          transition: transform 0.7s cubic-bezier(0.77, 0, 0.18, 1),
                      filter 0.5s ease;
        }
        .split:hover .split-bg {
          transform: scale(1.04);
          filter: blur(0px) brightness(0.55);
        }
        .split:not(:hover) .split-bg {
          filter: blur(2px) brightness(0.4);
        }
        /* Si rien n'est survolé, les deux sont nets */
        .container:not(:has(.split:hover)) .split-bg {
          filter: blur(0px) brightness(0.5);
        }

        .split-overlay {
          position: absolute;
          inset: 0;
          transition: opacity 0.5s ease;
        }
        .split-equestre .split-overlay {
          background: linear-gradient(135deg,
            rgba(12,26,46,0.7) 0%,
            rgba(32,80,160,0.3) 50%,
            transparent 100%);
        }
        .split-laserbay .split-overlay {
          background: linear-gradient(225deg,
            rgba(0,30,20,0.75) 0%,
            rgba(0,100,60,0.25) 50%,
            transparent 100%);
        }

        .split-content {
          position: relative;
          z-index: 10;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 3rem;
          transition: opacity 0.4s ease, transform 0.5s ease;
        }

        .split:not(:hover) .split-content {
          opacity: 0.6;
          transform: translateY(6px);
        }
        .split:hover .split-content {
          opacity: 1;
          transform: translateY(0);
        }
        .container:not(:has(.split:hover)) .split-content {
          opacity: 1;
          transform: translateY(0);
        }

        .tag {
          display: inline-block;
          font-family: 'Raleway', sans-serif;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 0.35em 0.9em;
          border-radius: 100px;
          margin-bottom: 1.2rem;
        }
        .tag-equestre {
          background: rgba(240,160,16,0.2);
          border: 1px solid rgba(240,160,16,0.5);
          color: #F0A010;
        }
        .tag-laserbay {
          background: rgba(0,200,100,0.15);
          border: 1px solid rgba(0,200,100,0.4);
          color: #00e87a;
        }

        .split-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(3rem, 5vw, 5.5rem);
          line-height: 0.95;
          letter-spacing: 0.02em;
          color: #ffffff;
          margin-bottom: 1rem;
          text-shadow: 0 4px 30px rgba(0,0,0,0.5);
        }

        .split-sub {
          font-family: 'Raleway', sans-serif;
          font-size: 0.95rem;
          font-weight: 300;
          color: rgba(255,255,255,0.75);
          line-height: 1.6;
          max-width: 320px;
          margin-bottom: 2rem;
        }

        .split-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          font-family: 'Raleway', sans-serif;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-decoration: none;
          padding: 0.85em 1.8em;
          border-radius: 8px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .split-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
        }
        .cta-equestre {
          background: #F0A010;
          color: #0C1A2E;
        }
        .cta-laserbay {
          background: #00c864;
          color: #001a0e;
        }

        /* Divider central */
        .divider {
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 3px;
          z-index: 20;
          transform: translateX(-50%);
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(255,255,255,0.6) 20%,
            rgba(255,255,255,0.9) 50%,
            rgba(255,255,255,0.6) 80%,
            transparent 100%
          );
          pointer-events: none;
          transition: left 0.7s cubic-bezier(0.77, 0, 0.18, 1);
        }
        .container:has(.split-equestre:hover) .divider { left: 58%; }
        .container:has(.split-laserbay:hover) .divider { left: 42%; }

        /* Logo central */
        .center-badge {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          z-index: 30;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: rgba(10,10,10,0.85);
          border: 2px solid rgba(255,255,255,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          transition: left 0.7s cubic-bezier(0.77, 0, 0.18, 1);
          pointer-events: none;
        }
        .container:has(.split-equestre:hover) .center-badge { left: 58%; }
        .container:has(.split-laserbay:hover) .center-badge { left: 42%; }

        /* Logo top-left equestre */
        .logo-equestre {
          position: absolute;
          top: 2rem;
          left: 2rem;
          z-index: 15;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .logo-laserbay {
          position: absolute;
          top: 2rem;
          right: 2rem;
          z-index: 15;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .logo-text {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.1rem;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.9);
          text-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }

        /* Mobile */
        @media (max-width: 768px) {
          .split, .split:hover { width: 100% !important; }
          body { overflow-y: auto; }
          .container { flex-direction: column; }
          .split { height: 50vh; }
          .split-title { font-size: 3.5rem; }
          .divider { display: none; }
          .center-badge { display: none; }
          .split:not(:hover) .split-content { opacity: 1; transform: none; }
          .split:not(:hover) .split-bg { filter: blur(0px) brightness(0.45); }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .split-content { animation: fadeUp 0.8s ease forwards; }
        .split-laserbay .split-content { animation-delay: 0.15s; }
      `}</style>

      {/* ══ CONTAINER ══ */}
      <div className="container" style={{ display: "flex", width: "100%", height: "100%", position: "relative" }}>

        {/* ── CÔTÉ GAUCHE — Centre Équestre ── */}
        <Link href="https://centre-equestre-agon.vercel.app" className="split split-equestre" style={{ textDecoration: "none" }}>
          {/* Background photo */}
          <div
            className="split-bg"
            style={{
              backgroundImage: "url('/images/hero-plage.jpg')",
              backgroundPosition: "center 30%",
            }}
          />
          {/* Overlay teinté bleu marine */}
          <div className="split-overlay" />

          {/* Logo top */}
          <div className="logo-equestre">
            <img src="/images/logo-ce-agon.png" alt="CE Agon" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "contain" }} />
            <span className="logo-text">Centre Équestre</span>
          </div>

          {/* Contenu bas */}
          <div className="split-content">
            <span className="tag tag-equestre">Agon-Coutainville · Normandie</span>
            <h2 className="split-title">
              L'équitation<br />
              <span style={{ color: "#F0A010" }}>les pieds<br />dans le sable</span>
            </h2>
            <p className="split-sub">
              Stages, balades au coucher du soleil, cours toute l'année et mini-ferme pédagogique. À 800m de la mer.
            </p>
            <span className="split-cta cta-equestre">
              Découvrir →
            </span>
          </div>
        </Link>

        {/* ── DIVIDER + BADGE central ── */}
        <div className="divider" />
        <div className="center-badge">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* ── CÔTÉ DROIT — LaserBay ── */}
        <a
          href="https://laserbay.net"
          target="_blank"
          rel="noopener noreferrer"
          className="split split-laserbay"
          style={{ textDecoration: "none" }}
        >
          {/* Background photo — à remplacer par ta vraie photo laserbay */}
          <div
            className="split-bg"
            style={{
              backgroundImage: "url('/images/laserbay-hero.jpg'), linear-gradient(135deg, #001a0e 0%, #003020 50%, #001a10 100%)",
              backgroundPosition: "center",
            }}
          />
          {/* Overlay teinté vert sombre */}
          <div className="split-overlay" />

          {/* Logo top */}
          <div className="logo-laserbay">
            <span className="logo-text" style={{ color: "#00e87a" }}>⚡ LaserBay</span>
          </div>

          {/* Contenu bas */}
          <div className="split-content" style={{ alignItems: "flex-end", textAlign: "right" }}>
            <span className="tag tag-laserbay" style={{ alignSelf: "flex-end" }}>LaserTag · Plein air</span>
            <h2 className="split-title">
              Le laser<br />
              <span style={{ color: "#00e87a" }}>tag en<br />plein air</span>
            </h2>
            <p className="split-sub" style={{ textAlign: "right", marginLeft: "auto" }}>
              Une aventure laser immersive en bord de mer. Sans projectiles, 100% adrénaline, pour toute la famille.
            </p>
            <span className="split-cta cta-laserbay">
              ← Découvrir
            </span>
          </div>
        </a>

      </div>
    </div>
  );
}
