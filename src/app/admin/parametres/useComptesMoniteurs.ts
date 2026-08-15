"use client";
/**
 * src/app/admin/parametres/useComptesMoniteurs.ts
 *
 * Gestion des COMPTES DE CONNEXION des moniteurs (Firebase Auth), par
 * opposition à leur FICHE (collection Firestore `moniteurs`).
 *
 * Deux notions distinctes, volontairement réunies dans le même écran :
 * la fiche décrit la personne (nom, rôle, téléphone), le compte lui donne
 * l'accès à l'application. Le rapprochement entre les deux se fait par
 * l'EMAIL, et uniquement par lui — d'où `accountFor`.
 *
 * Regroupé dans un hook parce que ces quatre actions (créer, supprimer,
 * rafraîchir le rôle, diagnostiquer) partagent le même état « email en cours
 * de traitement » et rechargent toutes la même liste. Le hook est appelé sans
 * condition par la page : l'ordre des hooks et le comportement sont
 * strictement ceux d'avant l'extraction.
 */
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

export function useComptesMoniteurs() {
  // Comptes de connexion (Firebase Auth) — pour afficher/gérer l'accès depuis ici.
  // On relie un compte à une fiche moniteur par l'EMAIL.
  const [authMoniteurs, setAuthMoniteurs] = useState<any[]>([]);
  const [accountBusy, setAccountBusy] = useState<string>(""); // email en cours de traitement

  const reloadAuthMoniteurs = async () => {
    try {
      const res = await authFetch("/api/admin/list-moniteurs");
      const data = await res.json();
      if (data.moniteurs) setAuthMoniteurs(data.moniteurs);
    } catch (e) { console.error("Chargement comptes moniteurs:", e); }
  };

  // Compte Auth correspondant à une fiche moniteur (rapprochement par email)
  const accountFor = (m: any) =>
    authMoniteurs.find(a => (a.email || "").toLowerCase() === (m.email || "").toLowerCase());

  // Créer l'accès (compte Firebase Auth + rôle moniteur) pour une fiche existante
  const createAccess = async (m: any) => {
    if (!m.email) { alert("Ajoutez d'abord un email à ce moniteur (bouton Modifier)."); return; }
    const password = window.prompt(
      `Mot de passe initial pour le compte de ${m.name} (${m.email}) ?\n\nMinimum 6 caractères. Vous le communiquerez au moniteur, qui pourra le changer ensuite.`
    );
    if (password === null) return; // annulé
    if (password.length < 6) { alert("Le mot de passe doit faire au moins 6 caractères."); return; }
    setAccountBusy(m.email);
    try {
      const res = await authFetch("/api/admin/create-moniteur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: m.name, email: m.email, password }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Erreur lors de la création du compte."); return; }
      // Compte préexistant rattaché : le mot de passe saisi n'a PAS été
      // appliqué, il faut le dire clairement sous peine de communiquer un
      // mot de passe qui ne fonctionnera pas.
      alert(data.adopted
        ? `✅ Accès moniteur accordé à ${m.email}.\n\nUn compte existait déjà pour cette adresse : il a été rattaché.\n⚠️ Le mot de passe que vous venez de saisir n'a PAS été appliqué — la personne se connecte avec son mot de passe habituel (ou via « mot de passe oublié »).`
        : `✅ Accès créé pour ${m.email}.\nLe moniteur peut se connecter via « Connexion par email ».`);
      await reloadAuthMoniteurs();
    } catch (e) { alert("Erreur réseau."); }
    finally { setAccountBusy(""); }
  };

  const deleteAccess = async (m: any, acct: any) => {
    if (!confirm(`Supprimer l'ACCÈS (compte de connexion) de ${m.name} (${m.email}) ?\n\nLa fiche moniteur est conservée — seul le compte de connexion est supprimé.`)) return;
    setAccountBusy(m.email);
    try {
      const res = await authFetch("/api/admin/create-moniteur", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: acct.uid }),
      });
      if (res.ok) { await reloadAuthMoniteurs(); }
      else { const d = await res.json(); alert(d.error || "Erreur lors de la suppression du compte."); }
    } catch (e) { alert("Erreur réseau."); }
    finally { setAccountBusy(""); }
  };

  const refreshAccessClaim = async (m: any, acct: any) => {
    if (!confirm(
      `Rafraîchir le rôle moniteur de ${m.name} ?\n\n` +
      `Cela réapplique le droit d'accès et déconnecte la personne de ses sessions. ` +
      `Elle devra se reconnecter (utile en cas d'erreur de permission).`
    )) return;
    setAccountBusy(m.email);
    try {
      const res = await authFetch("/api/admin/refresh-moniteur-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: acct.uid }),
      });
      if (res.ok) alert(`Rôle moniteur réappliqué pour ${m.name}. Demandez-lui de se reconnecter.`);
      else { const d = await res.json(); alert(d.error || "Erreur lors du rafraîchissement."); }
    } catch (e) { alert("Erreur réseau."); }
    finally { setAccountBusy(""); }
  };

  const diagAccess = async (m: any) => {
    try {
      const res = await authFetch(`/api/admin/diag-claims?email=${encodeURIComponent(m.email)}`);
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Erreur lors du diagnostic."); return; }
      const claims = data.customClaims || {};
      const claimsStr = Object.keys(claims).length === 0 ? "AUCUN CLAIM" : JSON.stringify(claims, null, 2);
      alert(
        `🔍 Diagnostic accès — ${m.name}\n\n` +
        `Email : ${data.email}\nUID : ${data.uid}\n` +
        `Compte désactivé : ${data.disabled ? "OUI" : "non"}\n` +
        `Email vérifié : ${data.emailVerified ? "oui" : "NON"}\n\n` +
        `Custom claims : ${claimsStr}\n\n` +
        `✅ Claim moniteur : ${data.hasMoniteurClaim ? "OUI" : "❌ NON"}\n` +
        `✅ Claim admin : ${data.hasAdminClaim ? "OUI" : "non"}\n\n` +
        `Dernière connexion : ${data.lastSignIn || "jamais"}`
      );
    } catch (e) { alert("Erreur réseau."); }
  };

  return { authMoniteurs, accountBusy, reloadAuthMoniteurs, accountFor, createAccess, deleteAccess, refreshAccessClaim, diagAccess };
}
