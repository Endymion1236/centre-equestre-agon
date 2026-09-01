"use client";

/**
 * src/app/admin/parametres/SectionMoniteurs.tsx
 *
 * L'onglet Moniteurs des paramètres : les fiches de l'équipe et, en regard,
 * les comptes de connexion. Une fiche et un compte se rapprochent par
 * l'adresse électronique — c'est le seul lien entre les deux.
 *
 * Cet onglet portait huit états et cinq appels d'administration des accès au
 * milieu d'un écran qui ne parle par ailleurs que de tarifs et de barèmes.
 * Le chargement se faisait sous condition de l'onglet actif ; le composant
 * n'étant monté que sur cet onglet, la condition disparaît d'elle-même.
 */

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Card, Badge } from "@/components/ui";
import { Loader2, Trash2, Plus, KeyRound, AlertTriangle, RefreshCw, Pencil, ShieldCheck, ShieldOff, Search } from "lucide-react";

export default function SectionMoniteurs() {
  const [moniteurs, setMoniteurs] = useState<any[]>([]);
  const [showAddMoniteur, setShowAddMoniteur] = useState(false);
  const [editMoniteurId, setEditMoniteurId] = useState<string | null>(null);
  const [moniteurForm, setMoniteurForm] = useState({ name: "", role: "", email: "", phone: "", status: "active" });
  const [moniteurSaving, setMoniteurSaving] = useState(false);
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
  useEffect(() => {
    getDocs(collection(db, "moniteurs")).then(snap => {
      setMoniteurs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    reloadAuthMoniteurs();
  }, []);

  return (
      <div className="flex flex-col gap-4">
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-body text-base font-semibold text-blue-800">Moniteurs & instructeurs</h3>
              <p className="font-body text-[11px] text-slate-400 mt-0.5">
                Chaque moniteur a une fiche (nom, rôle, email…) et, en dessous, son <strong>accès</strong> (compte de connexion). L'accès se gère ici, relié par l'email.
              </p>
            </div>
            <button type="button" onClick={() => { setShowAddMoniteur(true); setEditMoniteurId(null); setMoniteurForm({ name: "", role: "", email: "", phone: "", status: "active" }); }}
              className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-400">
              <Plus size={14} /> Ajouter
            </button>
          </div>

          {moniteurs.length === 0 ? (
            <p className="font-body text-sm text-slate-400 text-center py-4">Aucun moniteur enregistré.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {moniteurs.map((m: any) => (
                <div key={m.id} className="bg-sand rounded-lg px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center font-body text-sm font-bold text-blue-500">
                      {(m.name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">{m.name}</div>
                      <div className="font-body text-xs text-slate-400">{m.role}{m.email ? ` · ${m.email}` : ""}{m.phone ? ` · ${m.phone}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={m.status === "active" ? "green" : "gray"}>{m.status === "active" ? "Actif" : "Inactif"}</Badge>
                    <button type="button" onClick={async () => {
                      await updateDoc(doc(db, "moniteurs", m.id), { status: m.status === "active" ? "inactive" : "active" });
                      setMoniteurs(prev => prev.map(x => x.id === m.id ? { ...x, status: m.status === "active" ? "inactive" : "active" } : x));
                    }} className="font-body text-[10px] text-slate-400 hover:text-blue-500 bg-transparent border-none cursor-pointer px-1"
                      title={m.status === "active" ? "Désactiver" : "Réactiver"}>
                      {m.status === "active" ? "Désactiver" : "Réactiver"}
                    </button>
                    <button type="button" onClick={() => {
                      setEditMoniteurId(m.id);
                      setMoniteurForm({ name: m.name || "", role: m.role || "", email: m.email || "", phone: m.phone || "", status: m.status || "active" });
                      setShowAddMoniteur(true);
                    }} className="text-blue-400 hover:text-blue-600 bg-transparent border-none cursor-pointer p-1" title="Modifier la fiche">
                      <Pencil size={14}/>
                    </button>
                    <button type="button" onClick={async () => {
                      if (!confirm(`Supprimer la fiche de ${m.name} ?`)) return;
                      await deleteDoc(doc(db, "moniteurs", m.id));
                      setMoniteurs(prev => prev.filter(x => x.id !== m.id));
                    }} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1" title="Supprimer la fiche">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                  </div>

                  {/* Ligne « accès » : compte de connexion (Firebase Auth), relié par email */}
                  <div className="flex items-center justify-between flex-wrap gap-2 border-t border-blue-100/70 pt-2">
                    {(() => {
                      const acct = accountFor(m);
                      const busy = !!accountBusy && accountBusy === m.email;
                      if (acct) {
                        return (
                          <>
                            <span className="flex items-center gap-1.5 font-body text-[11px] font-semibold text-green-600">
                              <ShieldCheck size={13} /> Accès actif{acct.disabled ? " (désactivé)" : ""}
                            </span>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => diagAccess(m)} title="Diagnostic des droits"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-purple-500 hover:bg-purple-50 bg-transparent border-none cursor-pointer">
                                <Search size={13} />
                              </button>
                              <button type="button" onClick={() => refreshAccessClaim(m, acct)} disabled={busy} title="Rafraîchir le rôle (erreurs de permission)"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 bg-transparent border-none cursor-pointer disabled:opacity-50">
                                {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                              </button>
                              <button type="button" onClick={() => deleteAccess(m, acct)} disabled={busy} title="Supprimer le compte de connexion (la fiche est conservée)"
                                className="flex items-center gap-1 font-body text-[10px] font-semibold text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer px-1.5 py-1 disabled:opacity-50">
                                <ShieldOff size={12} /> Supprimer l'accès
                              </button>
                            </div>
                          </>
                        );
                      }
                      if (!m.email) {
                        return (
                          <span className="flex items-center gap-1.5 font-body text-[11px] text-slate-400">
                            <ShieldOff size={13} /> Pas d'email — ajoutez-en un (Modifier) pour pouvoir créer l'accès
                          </span>
                        );
                      }
                      return (
                        <>
                          <span className="flex items-center gap-1.5 font-body text-[11px] text-slate-400">
                            <ShieldOff size={13} /> Aucun compte de connexion
                          </span>
                          <button type="button" onClick={() => createAccess(m)} disabled={busy} title="Créer le compte de connexion moniteur"
                            className="flex items-center gap-1.5 font-body text-[11px] font-semibold text-white bg-blue-500 hover:bg-blue-400 px-2.5 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Créer l'accès
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Comptes de connexion existants SANS fiche moniteur (réconciliation) */}
        {(() => {
          const orphans = authMoniteurs.filter(a =>
            !moniteurs.some(m => (m.email || "").toLowerCase() === (a.email || "").toLowerCase())
          );
          if (orphans.length === 0) return null;
          return (
            <Card padding="md" className="border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={15} className="text-amber-500" />
                <h3 className="font-body text-base font-semibold text-amber-700">Comptes de connexion sans fiche</h3>
              </div>
              <p className="font-body text-[11px] text-slate-400 mb-3">
                Ces personnes ont un <strong>accès</strong> (compte de connexion) mais pas de fiche moniteur ici. Crée-leur une fiche pour les retrouver dans le planning et le management.
              </p>
              <div className="flex flex-col gap-2">
                {orphans.map((a: any) => {
                  const busy = !!accountBusy && accountBusy === a.email;
                  return (
                    <div key={a.uid} className="flex items-center justify-between flex-wrap gap-2 bg-amber-50/60 rounded-lg px-4 py-3">
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{a.displayName || a.email}</div>
                        <div className="font-body text-xs text-slate-400">{a.email}{a.disabled ? " · compte désactivé" : ""}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={async () => {
                          const ref = await addDoc(collection(db, "moniteurs"), {
                            name: a.displayName || a.email, role: "", email: a.email, phone: "", status: "active", createdAt: serverTimestamp(),
                          });
                          setMoniteurs(prev => [...prev, { id: ref.id, name: a.displayName || a.email, role: "", email: a.email, phone: "", status: "active" }]);
                        }} className="flex items-center gap-1.5 font-body text-[11px] font-semibold text-white bg-blue-500 hover:bg-blue-400 px-2.5 py-1.5 rounded-lg border-none cursor-pointer" title="Créer une fiche moniteur à partir de ce compte">
                          <Plus size={12} /> Créer la fiche
                        </button>
                        <button type="button" onClick={() => deleteAccess({ name: a.displayName || a.email, email: a.email }, a)} disabled={busy}
                          className="flex items-center gap-1 font-body text-[10px] font-semibold text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer px-1.5 py-1 disabled:opacity-50" title="Supprimer ce compte de connexion">
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />} Supprimer l'accès
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {/* Formulaire ajout */}
        {showAddMoniteur && (
          <Card padding="md" className="border-blue-200">
            <h4 className="font-body text-sm font-semibold text-blue-800 mb-3">{editMoniteurId ? "Modifier le moniteur" : "Nouveau moniteur"}</h4>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Nom *</label>
                  <input value={moniteurForm.name} onChange={e => setMoniteurForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Emmeline" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Rôle</label>
                  <input value={moniteurForm.role} onChange={e => setMoniteurForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="Ex: BPJEPS Équitation" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Email</label>
                  <input type="email" value={moniteurForm.email} onChange={e => setMoniteurForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemple.fr" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Téléphone</label>
                  <input type="tel" value={moniteurForm.phone} onChange={e => setMoniteurForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="06 00 00 00 00" className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowAddMoniteur(false); setEditMoniteurId(null); }}
                  className="px-4 py-2 rounded-lg font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
                  Annuler
                </button>
                <button type="button" disabled={!moniteurForm.name.trim() || moniteurSaving}
                  onClick={async () => {
                    setMoniteurSaving(true);
                    if (editMoniteurId) {
                      // Édition
                      await updateDoc(doc(db, "moniteurs", editMoniteurId), {
                        ...moniteurForm,
                        updatedAt: serverTimestamp(),
                      });
                      setMoniteurs(prev => prev.map(x => x.id === editMoniteurId ? { ...x, ...moniteurForm } : x));
                    } else {
                      // Ajout
                      const ref = await addDoc(collection(db, "moniteurs"), {
                        ...moniteurForm,
                        createdAt: serverTimestamp(),
                      });
                      setMoniteurs(prev => [...prev, { id: ref.id, ...moniteurForm }]);
                    }
                    setShowAddMoniteur(false);
                    setEditMoniteurId(null);
                    setMoniteurSaving(false);
                  }}
                  className="flex-1 py-2 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 border-none cursor-pointer disabled:opacity-50">
                  {moniteurSaving ? "Sauvegarde..." : editMoniteurId ? "Enregistrer les modifications" : "Ajouter le moniteur"}
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
  );
}
