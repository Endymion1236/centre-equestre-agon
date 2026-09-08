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
  if (/^drive (list|meta|get) 403/.test(message)) {
    return { statut: 409, erreur: "Google a refusé l'accès à ce dossier. Vérifiez qu'il appartient bien au compte connecté, ou qu'il lui est partagé." };
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
