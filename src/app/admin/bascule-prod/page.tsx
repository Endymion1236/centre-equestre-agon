"use client";

// ─────────────────────────────────────────────────────────────────────────
//  Page admin : Bascule prod — Phase 1 (envoi liens d'activation pilotes)
// ─────────────────────────────────────────────────────────────────────────
// Permet de selectionner jusqu'a 10 familles pilotes et de leur envoyer
// un lien magique d'activation. Le reset de la base n'est PAS branche ici
// pour le moment, viendra en Phase 2 quand Nicolas aura valide le flow
// d'activation avec les pilotes.

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";

interface Family {
  id: string;
  parentName: string;
  parentEmail: string;
  children: any[];
}

interface SendResult {
  familyId: string;
  parentName?: string;
  email?: string;
  status: "sent" | "skipped" | "failed" | "dryrun";
  reason?: string;
}

export default function BasculeProdPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastResults, setLastResults] = useState<SendResult[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "families"));
        const list: Family[] = snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            parentName: data.parentName || "—",
            parentEmail: data.parentEmail || "",
            children: data.children || [],
          };
        });
        // Tri par nom de famille (lastName si dispo, sinon parentName)
        list.sort((a, b) => a.parentName.localeCompare(b.parentName));
        setFamilies(list);
      } catch (e) {
        console.error(e);
        toast("Erreur chargement familles", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, toast]);

  const filtered = useMemo(() => {
    if (!search.trim()) return families;
    const q = search.toLowerCase();
    return families.filter(f =>
      f.parentName.toLowerCase().includes(q) ||
      f.parentEmail.toLowerCase().includes(q) ||
      f.children.some((c: any) => (c.firstName || "").toLowerCase().includes(q)),
    );
  }, [families, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      else toast("Maximum 10 familles par envoi (phase pilote)", "warning");
      return next;
    });
  };

  const handleSend = async (dryRun: boolean) => {
    if (selected.size === 0) {
      toast("Selectionne au moins une famille", "warning");
      return;
    }
    const action = dryRun ? "simuler" : "envoyer pour de vrai";

    // En mode REEL : detection des emails qui ressemblent a des fiches test
    // (laserbay, test, demo, fake, exemple). Avertissement supplementaire
    // pour eviter d'envoyer par erreur a une fiche technique residuelle.
    if (!dryRun) {
      const suspects = families
        .filter(f => selected.has(f.id))
        .filter(f => /test|demo|fake|exemple|laserbay/i.test(f.parentEmail) || /test|demo|fake|exemple|laserbay/i.test(f.parentName));
      if (suspects.length > 0) {
        const lines = suspects.map(s => `  - ${s.parentName} (${s.parentEmail})`).join("\n");
        if (!confirm(
          `⚠️ ATTENTION — ${suspects.length} famille(s) selectionnee(s) ressemble(nt) a des fiches de test :\n\n${lines}\n\nEnvoyer quand meme un vrai email a ces adresses ?`,
        )) return;
      }
    }

    if (!confirm(
      `Tu vas ${action} l'envoi d'un lien d'activation a ${selected.size} famille(s).\n\n` +
      (dryRun
        ? "Mode SIMULATION : aucun email ne sera envoye."
        : "⚠️ Mode REEL : les familles vont recevoir un email immediatement.") +
      "\n\nContinuer ?"
    )) return;

    setSending(true);
    setLastResults(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/send-activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          familyIds: Array.from(selected),
          dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Erreur envoi", "error");
        return;
      }
      setLastResults(data.results || []);
      const { sent, failed, skipped, dryruns } = data.summary || {};
      if (dryRun) {
        toast(`Simulation : ${dryruns} familles seraient contactees`, "success");
      } else {
        const parts: string[] = [];
        if (sent) parts.push(`✅ ${sent} envoye(s)`);
        if (skipped) parts.push(`⏭️ ${skipped} ignore(s)`);
        if (failed) parts.push(`❌ ${failed} echec(s)`);
        toast(parts.join(" · ") || "Termine", sent > 0 ? "success" : "warning");
      }
    } catch (e: any) {
      console.error(e);
      toast(`Erreur : ${e.message}`, "error");
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl">Acces refuse</h1>
        <p className="font-body text-slate-600 mt-2">Cette page est reservee aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
          Bascule prod — Phase 1
        </h1>
        <p className="font-body text-sm text-slate-600">
          Envoi des liens d'activation aux familles pilotes. Tu peux selectionner
          jusqu'a 10 familles par envoi. Une fois la famille connectee, elle aura
          acces a son espace cavalier avec sa progression pedagogique existante.
        </p>
      </div>

      {/* Workflow encadre */}
      <div className="mb-6 p-4 rounded-2xl bg-blue-50 border border-blue-200">
        <h2 className="font-body font-semibold text-blue-900 mb-2">📋 Procedure recommandee</h2>
        <ol className="font-body text-sm text-blue-900 space-y-1 list-decimal pl-5">
          <li>Choisis 1-3 familles pilotes (toi-meme, Emmeline, un parent de confiance)</li>
          <li>Clique sur <strong>Simuler</strong> pour verifier les emails et noms</li>
          <li>Si tout est OK, clique sur <strong>Envoyer pour de vrai</strong></li>
          <li>Verifie que chaque famille recoit l'email et arrive a se connecter</li>
          <li>Quand les pilotes ont valide, tu pourras envoyer aux 93 familles en masse (Phase 3)</li>
        </ol>
      </div>

      {/* Recherche */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (nom famille, email, prenom enfant)"
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 outline-none font-body"
        />
      </div>

      {/* Compteur + actions */}
      <div className="mb-4 flex flex-wrap items-center gap-3 sticky top-0 bg-white py-3 z-10 border-b border-slate-200">
        <div className="font-body text-sm">
          <strong>{selected.size}</strong> selectionnee(s) <span className="text-slate-500">/ {filtered.length} affichees</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => handleSend(true)}
          disabled={sending || selected.size === 0}
          className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-body font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? "..." : "🔍 Simuler"}
        </button>
        <button
          onClick={() => handleSend(false)}
          disabled={sending || selected.size === 0}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-body font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? "Envoi…" : "📨 Envoyer pour de vrai"}
        </button>
      </div>

      {/* Resultats du dernier envoi */}
      {lastResults && lastResults.length > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <h3 className="font-body font-semibold text-slate-900 mb-3">Resultats du dernier envoi</h3>
          <div className="space-y-2">
            {lastResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 font-body text-sm">
                <span className="text-lg">
                  {r.status === "sent" ? "✅" :
                   r.status === "dryrun" ? "🔍" :
                   r.status === "skipped" ? "⏭️" : "❌"}
                </span>
                <span className="font-semibold">{r.parentName || r.familyId}</span>
                {r.email && <span className="text-slate-500">— {r.email}</span>}
                {r.reason && <span className="text-orange-600">— {r.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste familles */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => {
            const isSelected = selected.has(f.id);
            const hasEmail = f.parentEmail && f.parentEmail.includes("@");
            return (
              <label
                key={f.id}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-colors ${
                  isSelected
                    ? "bg-blue-50 border-blue-300"
                    : "bg-white border-slate-200 hover:border-slate-300"
                } ${!hasEmail ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!hasEmail}
                  onChange={() => toggle(f.id)}
                  className="w-5 h-5 accent-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-body font-semibold text-slate-900 truncate">{f.parentName}</div>
                  <div className="font-body text-xs text-slate-500 truncate">
                    {hasEmail ? f.parentEmail : "⚠️ Pas d'email"}
                    {f.children.length > 0 && (
                      <span className="ml-2">
                        · {f.children.length} enfant{f.children.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 font-body text-slate-500">
              Aucune famille trouvee.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
