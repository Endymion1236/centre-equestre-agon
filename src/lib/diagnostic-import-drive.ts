/**
 * src/lib/diagnostic-import-drive.ts
 *
 * Traduit une panne technique de l'import Drive en cause nommée et en geste à
 * faire, avec le code HTTP qui va avec.
 *
 * Pourquoi un module à part : la route répondait « Import Drive impossible
 * pour le moment » à tout. Or la cause la plus fréquente n'est pas passagère —
 * le jeton Google a expiré ou été révoqué, et il faut reconnecter le compte.
 * Un message qui invite à réessayer fait alors perdre du temps. Ici, c'est
 * testable sans Firebase ni Google.
 */

export const RECONNECTER_GOOGLE =
  "Reconnectez le compte Google dans Assistant boîte mail (le droit de lecture Drive est redemandé à la reconnexion), puis relancez l'import.";

export interface DiagnosticImportDrive {
  statut: number;
  erreur: string;
}

/**
 * Motif lisible dans la réponse d'erreur de Google, quand elle est en JSON.
 * On ne devine pas : on cite ce que Google a répondu, tronqué pour rester
 * affichable.
 */
function motifGoogle(message: string): string | null {
  const debut = message.indexOf("{");
  if (debut < 0) return null;
  try {
    const corps = JSON.parse(message.slice(debut)) as { error?: { message?: string; errors?: { reason?: string; message?: string }[] } };
    const brut = corps.error?.message || corps.error?.errors?.[0]?.message || corps.error?.errors?.[0]?.reason;
    return brut ? String(brut).slice(0, 300) : null;
  } catch {
    return null;
  }
}

export function diagnosticImportDrive(message: string): DiagnosticImportDrive | null {
  if (!message) return null;

  if (message === "DRIVE_SCOPE_MANQUANT") {
    return { statut: 409, erreur: `Accès Drive non accordé au compte Google connecté. ${RECONNECTER_GOOGLE}` };
  }
  if (/Gmail non connect/i.test(message)) {
    return { statut: 409, erreur: `Aucun compte Google n'est connecté. ${RECONNECTER_GOOGLE}` };
  }
  // Google refuse de renouveler l'accès : jeton révoqué, mot de passe changé,
  // ou application encore en mode test — Google expire alors le jeton en 7 jours.
  if (/^refresh \d+/.test(message) || /invalid_grant|unauthorized_client|invalid_client/i.test(message)) {
    return { statut: 409, erreur: `La connexion Google a expiré ou a été révoquée. ${RECONNECTER_GOOGLE}` };
  }
  if (/^drive (list|meta|get) 401/.test(message)) {
    return { statut: 409, erreur: `Google a refusé l'accès (session expirée). ${RECONNECTER_GOOGLE}` };
  }
  // L'API Drive est une API distincte de Gmail : elle doit être activée dans
  // le projet Google Cloud. Sans elle, tout dossier, même partagé, est refusé.
  if (/accessNotConfigured|has not been used in project|Drive API has not|API .{0,20}(disabled|not enabled)/i.test(message)) {
    // Google nomme le projet concerné : c'est LA donnée qui dit où activer
    // l'API. L'activer sur un autre projet ne change rien.
    const motif = motifGoogle(message);
    const projet = /project (\d{6,})/.exec(motif || message)?.[1];
    return {
      statut: 409,
      erreur: "L'API Google Drive n'est pas activée pour le projet Google Cloud qui porte les identifiants de connexion de l'application"
        + (projet ? ` — Google nomme le projet numéro ${projet}. Activez-la sur CE projet précisément` : "")
        + ". Dans la console Google Cloud, ouvrez « API et services » puis « Bibliothèque », activez « Google Drive API », attendez une minute et relancez l'import. Le partage du dossier n'y change rien tant que l'API est désactivée."
        + (motif ? ` Message de Google : « ${motif} »` : ""),
    };
  }
  // Le quota se présente aussi en 403 : il se traite avant le refus d'accès.
  if (/rateLimit|userRateLimitExceeded|quotaExceeded/i.test(message)) {
    return { statut: 429, erreur: "Google limite temporairement les requêtes. Attendez une minute puis relancez : les fichiers déjà importés ne le seront pas deux fois." };
  }
  if (/^drive (list|meta|get) 403/.test(message)) {
    // Sans le motif de Google, ce refus est indevinable : on le cite.
    const motif = motifGoogle(message);
    return {
      statut: 409,
      erreur: "Google a refusé l'accès à ce dossier. Vérifiez qu'il appartient bien au compte connecté, ou qu'il lui est partagé."
        + (motif ? ` Motif renvoyé par Google : « ${motif} »` : ""),
    };
  }
  if (/^Dossier Drive/.test(message)) {
    return { statut: 404, erreur: message };
  }
  if (/^drive (list|meta|get) 404/.test(message)) {
    return { statut: 404, erreur: "Dossier ou fichier Drive introuvable. Vérifiez le lien collé." };
  }
  if (/^drive (list|meta|get) 429/.test(message) || /rateLimit|quota/i.test(message)) {
    return { statut: 429, erreur: "Google limite temporairement les requêtes. Attendez une minute puis relancez : les fichiers déjà importés ne le seront pas deux fois." };
  }
  if (/storage|bucket|GCS/i.test(message)) {
    return { statut: 500, erreur: "Le stockage des pièces a refusé l'écriture. Les fichiers déjà importés sont conservés ; relancez l'import." };
  }
  return null;
}
