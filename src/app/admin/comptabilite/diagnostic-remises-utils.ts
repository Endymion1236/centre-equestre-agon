export interface RemiseDiagnostic {
  id: string;
  createdAt?: { seconds?: number } | null;
  total?: number;
  pointee?: boolean;
  pointeeNote?: string | null;
  paymentMode?: string;
  mode?: string;
  encaissementIds?: string[];
  paymentIds?: string[];
}

export interface EncaissementDiagnostic {
  reconciledByBank?: boolean;
  mode?: string;
}

export function construireDiagnosticRemises(
  remises: RemiseDiagnostic[],
  encaissements: EncaissementDiagnostic[],
) {
  const parMois: Record<string, { count: number; totalEur: number; pointees: number }> = {};
  const parEtat = { pointees: 0, nonPointees: 0 };
  const parMode: Record<string, number> = {};

  remises.forEach((remise) => {
    const date = remise.createdAt?.seconds
      ? new Date(remise.createdAt.seconds * 1000)
      : null;
    const mois = date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : "???";

    if (!parMois[mois]) parMois[mois] = { count: 0, totalEur: 0, pointees: 0 };
    parMois[mois].count++;
    parMois[mois].totalEur += remise.total || 0;
    if (remise.pointee) {
      parMois[mois].pointees++;
      parEtat.pointees++;
    } else {
      parEtat.nonPointees++;
    }

    const mode = remise.paymentMode || remise.mode || "?";
    parMode[mode] = (parMode[mode] || 0) + 1;
  });

  const recentes = [...remises]
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 15)
    .map((remise) => {
      const date = remise.createdAt?.seconds
        ? new Date(remise.createdAt.seconds * 1000)
        : null;
      return {
        id: remise.id,
        date: date
          ? date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
          : "???",
        mode: remise.paymentMode || remise.mode || "?",
        total: remise.total || 0,
        pointee: Boolean(remise.pointee),
        pointeeNote: remise.pointeeNote || null,
        nbEncaissements: (remise.encaissementIds || []).length,
        nbPaymentsLegacy: (remise.paymentIds || []).length,
      };
    });

  return {
    total: remises.length,
    parMois,
    parEtat,
    parMode,
    recentes,
    encaissements: {
      total: encaissements.length,
      reconciled: encaissements.filter((encaissement) => encaissement.reconciledByBank).length,
      cbTerminal: encaissements.filter((encaissement) => encaissement.mode === "cb_terminal").length,
    },
  };
}
