"use client";

export default function SplitHomePage() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Raleway:wght@300;400;600;700;800&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        .split-wrap {
          display: flex;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
        }

        .panel {
          position: relative;
          height: 100%;
          overflow: hidden;
          cursor: pointer;
          text-decoration: none;
          flex-shrink: 0;
          transition: flex 0.75s cubic-bezier(0.77, 0, 0.18, 1);
          flex: 1;
        }
        .split-wrap:hover .panel { flex: 0.72; }
        .split-wrap .panel:hover { flex: 1.28; }

        .panel-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          transition: transform 0.75s cubic-bezier(0.77,0,0.18,1), filter 0.6s ease;
          will-change: transform, filter;
        }
        .split-wrap:not(:hover) .panel-bg { filter: brightness(0.55); }
        .panel:hover .panel-bg { transform: scale(1.05); filter: brightness(0.5); }
        .split-wrap:hover .panel:not(:hover) .panel-bg { filter: blur(3px) brightness(0.28); }

        .panel-overlay { position: absolute; inset: 0; }
        .panel-oe .panel-overlay {
          background: linear-gradient(160deg, rgba(12,26,46,0.5) 0%, rgba(32,80,160,0.12) 60%, transparent 100%);
        }
        .panel-lb .panel-overlay {
          background: linear-gradient(200deg, rgba(0,15,10,0.6) 0%, rgba(0,80,40,0.12) 60%, transparent 100%);
        }

        .panel-logo {
          position: absolute; top: 2.2rem; z-index: 20;
          display: flex; align-items: center; gap: 0.7rem;
        }
        .panel-oe .panel-logo { left: 2.2rem; }
        .panel-lb .panel-logo { right: 2.2rem; flex-direction: row-reverse; }
        .logo-img { width: 38px; height: 38px; border-radius: 10px; object-fit: contain; }
        .logo-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.05rem; letter-spacing: 0.1em;
          color: rgba(255,255,255,0.88);
          text-shadow: 0 2px 12px rgba(0,0,0,0.6);
        }

        .panel-inner {
          position: relative; z-index: 10;
          height: 100%; display: flex; flex-direction: column;
          justify-content: flex-end; padding: 3.5rem;
          transition: opacity 0.45s ease, transform 0.5s ease;
        }
        .split-wrap:hover .panel:not(:hover) .panel-inner { opacity: 0.4; transform: translateY(10px); }

        .tag {
          display: inline-block;
          font-family: 'Raleway', sans-serif;
          font-size: 0.61rem; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase;
          padding: 0.38em 1em; border-radius: 100px;
          margin-bottom: 1.1rem; width: fit-content;
        }
        .tag-oe { background: rgba(240,160,16,0.18); border: 1px solid rgba(240,160,16,0.5); color: #F4C040; }
        .tag-lb { background: rgba(0,220,100,0.13); border: 1px solid rgba(0,220,100,0.42); color: #00e87a; }

        .panel-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(3.2rem, 4.5vw, 5.8rem);
          line-height: 0.93; letter-spacing: 0.025em;
          color: #fff; margin-bottom: 1.1rem;
          text-shadow: 0 6px 40px rgba(0,0,0,0.5);
        }
        .accent-oe { color: #F0A010; }
        .accent-lb { color: #00e87a; }

        .panel-desc {
          font-family: 'Raleway', sans-serif;
          font-size: 0.92rem; font-weight: 300;
          color: rgba(255,255,255,0.72); line-height: 1.65;
          max-width: 300px; margin-bottom: 2rem;
        }

        .panel-cta {
          display: inline-flex; align-items: center; gap: 0.5rem;
          font-family: 'Raleway', sans-serif;
          font-size: 0.82rem; font-weight: 800;
          letter-spacing: 0.06em; text-transform: uppercase;
          text-decoration: none;
          padding: 0.9em 2em; border-radius: 10px; width: fit-content;
          transition: transform 0.2s ease, box-shadow 0.25s ease, gap 0.2s ease;
        }
        .panel-cta:hover { transform: translateY(-3px); gap: 0.9rem; }
        .cta-oe { background: #F0A010; color: #0C1A2E; box-shadow: 0 8px 28px rgba(240,160,16,0.35); }
        .cta-oe:hover { box-shadow: 0 16px 48px rgba(240,160,16,0.5); }
        .cta-lb { background: #00c864; color: #001a0e; box-shadow: 0 8px 28px rgba(0,200,100,0.3); }
        .cta-lb:hover { box-shadow: 0 16px 48px rgba(0,200,100,0.45); }

        .panel-lb .panel-inner { align-items: flex-end; text-align: right; }
        .panel-lb .panel-desc { margin-left: auto; }

        .sep {
          position: absolute; left: 50%; top: 0; bottom: 0;
          width: 2px; transform: translateX(-50%);
          z-index: 30; pointer-events: none;
          background: linear-gradient(to bottom,
            transparent, rgba(255,255,255,0.5) 25%,
            rgba(255,255,255,0.85) 50%, rgba(255,255,255,0.5) 75%, transparent);
          transition: left 0.75s cubic-bezier(0.77, 0, 0.18, 1);
        }
        .split-wrap:has(.panel-oe:hover) .sep { left: 56%; }
        .split-wrap:has(.panel-lb:hover) .sep { left: 44%; }

        .puck {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          z-index: 31; width: 46px; height: 46px;
          border-radius: 50%;
          background: rgba(6,6,6,0.82);
          border: 1.5px solid rgba(255,255,255,0.28);
          backdrop-filter: blur(14px);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem; pointer-events: none;
          transition: left 0.75s cubic-bezier(0.77, 0, 0.18, 1);
        }
        .split-wrap:has(.panel-oe:hover) .puck { left: 56%; }
        .split-wrap:has(.panel-lb:hover) .puck { left: 44%; }

        @keyframes riseUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .panel-oe .panel-inner { animation: riseUp 0.9s 0.1s both ease; }
        .panel-lb .panel-inner { animation: riseUp 0.9s 0.25s both ease; }
        .panel-oe .panel-logo  { animation: riseUp 0.7s 0.05s both ease; }
        .panel-lb .panel-logo  { animation: riseUp 0.7s 0.2s both ease; }

        @media (max-width: 700px) {
          .split-wrap { flex-direction: column; }
          .panel, .split-wrap:hover .panel, .split-wrap .panel:hover { flex: 1 !important; }
          .panel-bg { filter: brightness(0.5) !important; transform: none !important; }
          .panel-inner { padding: 2rem; opacity: 1 !important; transform: none !important; }
          .panel-title { font-size: 3rem; }
          .sep, .puck { display: none; }
          .panel-lb .panel-logo { right: auto; left: 2.2rem; flex-direction: row; }
          .panel-lb .panel-inner { align-items: flex-start; text-align: left; }
          .panel-lb .panel-desc { margin-left: 0; }
        }
      `}</style>

      <div className="split-wrap" style={{ position: "relative" }}>

        {/* ═══ GAUCHE — Centre Équestre ═══ */}
        <a href="/accueil" className="panel panel-oe">
          <div className="panel-bg" style={{
            backgroundImage: "url('/images/hero-equestre.png')",
            backgroundPosition: "center 25%"
          }} />
          <div className="panel-overlay" />
          <div className="panel-logo">
            <img src="/images/logo-ce-agon.png" alt="CE Agon" className="logo-img" />
            <span className="logo-name">Centre Équestre</span>
          </div>
          <div className="panel-inner">
            <span className="tag tag-oe">Agon-Coutainville · Normandie</span>
            <h2 className="panel-title">
              L&apos;équitation<br />
              <span className="accent-oe">les pieds<br />dans le sable</span>
            </h2>
            <p className="panel-desc">
              Stages, balades au coucher du soleil, cours toute l&apos;année et mini-ferme pédagogique. À 800m de la mer.
            </p>
            <span className="panel-cta cta-oe">Découvrir →</span>
          </div>
        </a>

        {/* ═══ Séparateur ═══ */}
        <div className="sep" />
        <div className="puck">⚡</div>

        {/* ═══ DROITE — LaserBay ═══ */}
        <a href="https://laserbay.net" target="_blank" rel="noopener noreferrer" className="panel panel-lb">
          <div className="panel-bg" style={{
            backgroundImage: "url('/images/hero-laserbay.png')",
            backgroundPosition: "center 35%"
          }} />
          <div className="panel-overlay" />
          <div className="panel-logo">
            <span className="logo-name" style={{ color: "#00e87a" }}>LaserBay</span>
            <span style={{ fontSize: "1.3rem" }}>🎯</span>
          </div>
          <div className="panel-inner">
            <span className="tag tag-lb">LaserTag · Plein air</span>
            <h2 className="panel-title">
              Le laser<br />
              <span className="accent-lb">tag en<br />plein air</span>
            </h2>
            <p className="panel-desc">
              Une aventure laser immersive en bord de mer. Sans projectiles, 100% adrénaline, pour toute la famille.
            </p>
            <span className="panel-cta cta-lb">← Découvrir</span>
          </div>
        </a>

      </div>
    </div>
  );
}
