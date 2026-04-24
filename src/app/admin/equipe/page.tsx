"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { UserPlus, Trash2, Loader2, Shield, Eye, EyeOff, RefreshCw, Search } from "lucide-react";

interface Moniteur {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  createdAt: string;
}

export default function EquipePage() {
  const { user, isAdmin } = useAuth();
  const [moniteurs, setMoniteurs] = useState<Moniteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Formulaire
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = async () => {
    const token = await auth.currentUser?.getIdToken();
    return token || "";
  };

  const loadMoniteurs = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/list-moniteurs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.moniteurs) setMoniteurs(data.moniteurs);
    } catch (e) {
      console.error("Erreur chargement moniteurs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && isAdmin) loadMoniteurs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin]);

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    if (!form.displayName || !form.email || !form.password) {
      setError("Tous les champs sont requis.");
      return;
    }
    if (form.password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }

    setCreating(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/create-moniteur", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création.");
        return;
      }

      setSuccess(`Compte moniteur créé pour ${data.email}`);
      setForm({ displayName: "", email: "", password: "" });
      setShowForm(false);
      loadMoniteurs();
    } catch (e) {
      setError("Erreur réseau.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (moniteur: Moniteur) => {
    if (!confirm(`Supprimer le compte de ${moniteur.displayName} (${moniteur.email}) ?\n\nCette action est irréversible.`)) {
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch("/api/admin/create-moniteur", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: moniteur.uid }),
      });

      if (res.ok) {
        setSuccess(`Compte de ${moniteur.displayName} supprimé.`);
        loadMoniteurs();
      } else {
        const data = await res.json();
        setError(data.error || "Erreur lors de la suppression.");
      }
    } catch (e) {
      setError("Erreur réseau.");
    }
  };

  const handleRefreshClaim = async (moniteur: Moniteur) => {
    if (!confirm(
      `Rafraîchir le rôle moniteur de ${moniteur.displayName} ?\n\n` +
      `Cela réapplique le droit d'accès et déconnecte la personne de toutes ses sessions.\n` +
      `Elle devra se reconnecter pour retrouver ses droits (cela peut résoudre les erreurs de permission).`
    )) {
      return;
    }
    setError("");
    setSuccess("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/refresh-moniteur-claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid: moniteur.uid }),
      });
      if (res.ok) {
        setSuccess(`Rôle moniteur réappliqué pour ${moniteur.displayName}. Demandez-lui de se reconnecter.`);
      } else {
        const data = await res.json();
        setError(data.error || "Erreur lors du rafraîchissement.");
      }
    } catch (e) {
      setError("Erreur réseau.");
    }
  };

  // Diagnostic : affiche l'état réel des custom claims Firebase Auth d'un
  // moniteur. Permet de voir si le claim "moniteur: true" est bien posé
  // côté serveur, indépendamment de ce que son navigateur affiche.
  const handleDiag = async (moniteur: Moniteur) => {
    setError("");
    setSuccess("");
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/diag-claims?email=${encodeURIComponent(moniteur.email)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors du diagnostic.");
        return;
      }
      const claims = data.customClaims || {};
      const claimsStr = Object.keys(claims).length === 0 ? "AUCUN CLAIM" : JSON.stringify(claims, null, 2);
      alert(
        `🔍 Diagnostic claims — ${moniteur.displayName}\n\n` +
        `Email : ${data.email}\n` +
        `UID : ${data.uid}\n` +
        `Compte désactivé : ${data.disabled ? "OUI" : "non"}\n` +
        `Email vérifié : ${data.emailVerified ? "oui" : "NON"}\n\n` +
        `Custom claims : ${claimsStr}\n\n` +
        `✅ A le claim moniteur : ${data.hasMoniteurClaim ? "OUI" : "❌ NON"}\n` +
        `✅ A le claim admin : ${data.hasAdminClaim ? "OUI" : "non"}\n\n` +
        `Dernière connexion : ${data.lastSignIn || "jamais"}\n` +
        `Tokens révoqués après : ${data.tokensValidAfter || "jamais"}`
      );
    } catch (e) {
      setError("Erreur réseau.");
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <Shield className="w-12 h-12 text-orange-400 mx-auto mb-4" />
        <p className="font-body text-sm text-gray-500">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-blue-800">Équipe</h1>
          <p className="font-body text-sm text-gray-500 mt-1">
            Gérez les comptes moniteurs du centre.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(""); setSuccess(""); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer border-none"
        >
          <UserPlus size={16} />
          Nouveau moniteur
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 font-body text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 font-body text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Formulaire de création */}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-display text-lg font-bold text-blue-800 mb-4">Créer un compte moniteur</h2>
          <div className="flex flex-col gap-3 max-w-md">
            <div>
              <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">Nom complet</label>
              <input
                type="text"
                value={form.displayName}
                onChange={e => setForm({ ...form, displayName: e.target.value })}
                placeholder="Ex : Jean Dupont"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="moniteur@ce-agon.fr"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-600 mb-1 block">Mot de passe initial</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Min. 6 caractères"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white font-body text-sm font-semibold hover:bg-green-700 transition-colors cursor-pointer border-none disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Créer le compte
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 rounded-xl font-body text-sm text-gray-500 hover:bg-gray-100 cursor-pointer border-none bg-transparent"
              >
                Annuler
              </button>
            </div>
          </div>
          <p className="font-body text-xs text-gray-400 mt-4">
            Le moniteur pourra se connecter via &quot;Connexion par email&quot; sur la page de l&apos;espace cavalier.
            Il accédera automatiquement au back-office avec les sections autorisées.
          </p>
        </div>
      )}

      {/* Liste des moniteurs */}
      <div className="card">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-display text-sm font-bold text-gray-800">
            Moniteurs ({moniteurs.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : moniteurs.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-body text-sm text-gray-400">Aucun moniteur créé.</p>
            <p className="font-body text-xs text-gray-400 mt-1">
              Cliquez sur &quot;Nouveau moniteur&quot; pour commencer.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {moniteurs.map(m => (
              <div key={m.uid} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50">
                <div>
                  <div className="font-body text-sm font-semibold text-gray-800">{m.displayName}</div>
                  <div className="font-body text-xs text-gray-400">{m.email}</div>
                  {m.createdAt && (
                    <div className="font-body text-[10px] text-gray-300 mt-0.5">
                      Créé le {new Date(m.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 font-body text-[11px] font-semibold text-blue-600">
                    Moniteur
                  </span>
                  <button
                    onClick={() => handleDiag(m)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-purple-500 hover:bg-purple-50 cursor-pointer border-none bg-transparent transition-colors"
                    title="Diagnostic : voir les claims Firebase Auth"
                  >
                    <Search size={14} />
                  </button>
                  <button
                    onClick={() => handleRefreshClaim(m)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 cursor-pointer border-none bg-transparent transition-colors"
                    title="Rafraîchir le rôle (en cas d'erreur de permission)"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(m)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer border-none bg-transparent transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
