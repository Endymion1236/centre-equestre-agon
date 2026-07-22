"use client";

// Feuille d'appel imprimable — rendue UNIQUEMENT à l'impression (voir la classe
// `hidden print:block` posée par la page). Elle ne s'affiche jamais à l'écran :
// l'interface de travail reste inchangée, seul le rendu papier est repensé.
//
// Objectif : une ligne compacte par cavalier avec une case VIDE à cocher au
// crayon, pas la présence pré-remplie de l'écran (qui n'a pas de sens sur une
// feuille qu'on remplit à la main). Chaque reprise commence sur une nouvelle
// page pour qu'un moniteur reçoive une feuille par cours.

interface FeuilleProps {
  dateLabel: string;
  monitorFilter: string; // "" = tous
  creneaux: any[];
  families: any[];
  calcAge: (birthDate: any) => string;
  horseDisplay: (horseName: string) => string;
}

export function FeuilleAppelImpression({
  dateLabel,
  monitorFilter,
  creneaux,
  families,
  calcAge,
  horseDisplay,
}: FeuilleProps) {
  // L'âge n'est pas porté par l'inscription : on le résout depuis la fiche
  // famille, comme l'affichage écran. Nom de famille idem si absent de e.
  const infosCavalier = (e: any): { age: string; famille: string } => {
    const fam = families.find((f: any) => (f.children || []).some((c: any) => c.id === e.childId));
    const child = (fam?.children || []).find((c: any) => c.id === e.childId);
    return {
      age: calcAge(child?.birthDate),
      famille: e.familyName || fam?.parentName || "",
    };
  };
  const visibles = creneaux.filter(
    (c) => !monitorFilter || (c.monitor || "").trim() === monitorFilter
  );

  return (
    <div className="hidden print:block">
      {visibles.map((c, idx) => {
        const enrolled = (c.enrolled || []) as any[];
        return (
          <section
            key={c.id}
            // Saut de page entre reprises : chaque cours = une feuille.
            style={{ breakBefore: idx === 0 ? "auto" : "page" }}
          >
            <header
              style={{
                borderBottom: "2px solid #1e3a8a",
                paddingBottom: 6,
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {dateLabel}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1e3a8a" }}>
                  {c.activityTitle}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
                  {c.startTime}–{c.endTime}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                Moniteur : <strong>{c.monitor || "—"}</strong> · {enrolled.length} cavalier
                {enrolled.length > 1 ? "s" : ""}
              </div>
            </header>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>
                  <th style={{ width: 24, padding: "3px 4px" }}>#</th>
                  <th style={{ padding: "3px 4px" }}>Cavalier</th>
                  <th style={{ width: 44, padding: "3px 4px" }}>Âge</th>
                  <th style={{ padding: "3px 4px" }}>Poney</th>
                  <th style={{ width: 60, padding: "3px 4px", textAlign: "center" }}>Présent</th>
                </tr>
              </thead>
              <tbody>
                {enrolled.map((e, i) => {
                  const poney = horseDisplay(e.horseName) || "";
                  const { age, famille } = infosCavalier(e);
                  return (
                    <tr key={e.childId || i} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px 4px", color: "#94a3b8" }}>{i + 1}</td>
                      <td style={{ padding: "6px 4px", fontWeight: 600, color: "#0f172a" }}>
                        {e.childName || "—"}
                        {famille ? (
                          <span style={{ fontWeight: 400, color: "#64748b" }}> · {famille}</span>
                        ) : null}
                      </td>
                      <td style={{ padding: "6px 4px", color: "#475569" }}>{age}</td>
                      <td style={{ padding: "6px 4px", color: poney ? "#0f172a" : "#cbd5e1" }}>
                        {/* Poney affecté s'il l'est, sinon un trait à remplir à la main. */}
                        {poney || "____________"}
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "center" }}>
                        {/* Case VIDE : le moniteur coche à la main pendant l'appel. */}
                        <span
                          style={{
                            display: "inline-block",
                            width: 16,
                            height: 16,
                            border: "1.5px solid #475569",
                            borderRadius: 3,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {/* Quelques lignes vides pour les ajouts de dernière minute. */}
                {[0, 1, 2].map((k) => (
                  <tr key={`empty-${k}`} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 4px", color: "#cbd5e1" }}>{enrolled.length + k + 1}</td>
                    <td style={{ padding: "10px 4px" }} />
                    <td style={{ padding: "10px 4px" }} />
                    <td style={{ padding: "10px 4px", color: "#cbd5e1" }}>____________</td>
                    <td style={{ padding: "10px 4px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 16,
                          height: 16,
                          border: "1.5px solid #cbd5e1",
                          borderRadius: 3,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
