"use client";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { CATEGORIES, JOURS_LABELS } from "./types";
import type { DialogueConflitsModele } from "./planning-types";

/**
 * Modale de conflits lors de l'application d'un modèle.
 *
 * S'ouvre quand on applique un modèle qui a au moins une tâche en
 * doublon avec la semaine actuelle (même salarié + même jour +
 * même heure + même tâche). 3 options : remplacer / ajouter / annuler.
 *
 * Le doublon silencieux est le piège classique du bouton « appliquer un
 * modèle » : on croit remplacer, on empile. D'où cette liste explicite et
 * le choix par défaut mis en avant (« Remplacer »).
 */

interface Props {
  conflictDialog: DialogueConflitsModele;
  semaine: string;
  applyingModele: boolean;
  conflictRemplacer: () => void;
  conflictAjouterQuandMeme: () => void;
  conflictAnnuler: () => void;
}

export default function PlanningModaleConflits({
  conflictDialog, semaine, applyingModele,
  conflictRemplacer, conflictAjouterQuandMeme, conflictAnnuler,
}: Props) {
  return (
        <div
          onClick={conflictAnnuler}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 80,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 18, maxWidth: 560, width: "100%",
              maxHeight: "90vh", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
            }}
          >
            {/* En-tête */}
            <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: "#fef3c7",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <AlertTriangle size={18} color="#d97706" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Conflit détecté
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#64748b" }}>
                    Modèle « {conflictDialog.modele.nom} » · semaine {semaine}
                  </div>
                </div>
                <button
                  onClick={conflictAnnuler}
                  style={{
                    background: "transparent", border: "none", padding: 4,
                    cursor: "pointer", color: "#94a3b8",
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#475569", margin: "10px 0 0", lineHeight: 1.5 }}>
                <strong>{conflictDialog.duplicates.length}</strong> tâche{conflictDialog.duplicates.length > 1 ? "s" : ""} du modèle existe{conflictDialog.duplicates.length > 1 ? "nt" : ""} déjà dans la semaine
                {conflictDialog.nouvelles.length > 0 && (
                  <> · <strong>{conflictDialog.nouvelles.length}</strong> nouvelle{conflictDialog.nouvelles.length > 1 ? "s" : ""} à ajouter</>
                )}
              </p>
            </div>

            {/* Liste des doublons */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 22px" }}>
              <div style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Doublons ({conflictDialog.duplicates.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {conflictDialog.duplicates.slice(0, 20).map((d, i) => {
                  const cat = CATEGORIES.find(c => c.id === d.nouvelle.categorie);
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8,
                      padding: "8px 12px",
                    }}>
                      <span style={{ fontSize: 14 }}>{cat?.emoji || "📌"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                          {d.nouvelle.tacheLabel}
                        </div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#64748b" }}>
                          {JOURS_LABELS[d.nouvelle.jour]} · {d.nouvelle.heureDebut} · {d.nouvelle.salarieName}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {conflictDialog.duplicates.length > 20 && (
                  <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#94a3b8", fontStyle: "italic", paddingLeft: 8 }}>
                    … et {conflictDialog.duplicates.length - 20} autre{conflictDialog.duplicates.length - 20 > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: "14px 22px 20px", borderTop: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={conflictRemplacer}
                disabled={applyingModele}
                style={{
                  width: "100%", padding: "12px 14px",
                  background: "#3b82f6", color: "white", border: "none", borderRadius: 10,
                  fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: applyingModele ? 0.5 : 1,
                }}
              >
                <RotateCcw size={15} />
                Remplacer les doublons ({conflictDialog.duplicates.length})
              </button>
              <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#94a3b8", textAlign: "center", margin: "-2px 0 4px" }}>
                Recommandé · les tâches existantes sont supprimées puis recréées
              </div>

              <button
                onClick={conflictAjouterQuandMeme}
                disabled={applyingModele}
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "white", color: "#d97706",
                  border: "1px solid #fcd34d", borderRadius: 10,
                  fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  opacity: applyingModele ? 0.5 : 1,
                }}
              >
                Ajouter quand même (créera des doublons)
              </button>

              <button
                onClick={conflictAnnuler}
                disabled={applyingModele}
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "#f1f5f9", color: "#475569",
                  border: "none", borderRadius: 10,
                  fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
  );
}
