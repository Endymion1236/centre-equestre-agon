"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Download, FolderLock, Loader2 } from "lucide-react";
import { TYPES_DOC_SALARIE, labelTypeDoc, emojiTypeDoc, labelPeriode, type DocSalarie } from "@/lib/docs-salaries";

/**
 * Mes documents — espace personnel de chaque collaborateur.
 *
 * Chacun ne voit que les documents déposés par l'admin pour SON email
 * (fiches de paie, attestations France Travail, contrats…). Les rules
 * Firestore imposent le filtre : la query doit viser l'email du compte
 * connecté, en minuscules, sinon elle est refusée.
 */
export default function MesDocumentsPage() {
  const { user } = useAuth();
  const [docsList, setDocsList] = useState<DocSalarie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, "documents-salaries"),
          where("email", "==", user.email!.toLowerCase()),
        ));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as DocSalarie[];
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setDocsList(list);
      } catch (e) {
        console.error(e);
        setDocsList([]);
      }
      setLoading(false);
    })();
  }, [user]);

  const parType = TYPES_DOC_SALARIE
    .map(t => ({ ...t, docs: docsList.filter(d => d.type === t.id) }))
    .filter(t => t.docs.length > 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Mes documents</h1>
        <p className="font-body text-sm text-slate-500 mt-1">
          Fiches de paie, attestations et documents déposés par le centre. Ils sont personnels : chacun ne voit que les siens.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : docsList.length === 0 ? (
        <Card padding="lg" className="text-center">
          <FolderLock size={32} className="text-slate-300 mx-auto mb-2" />
          <p className="font-body text-sm text-slate-500">Aucun document pour l'instant.</p>
          <p className="font-body text-xs text-slate-400 mt-1">
            Les documents déposés par le centre pour <strong>{user?.email}</strong> apparaîtront ici.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {parType.map(groupe => (
            <section key={groupe.id}>
              <h2 className="font-display text-base font-bold text-blue-800 mb-2">
                {groupe.emoji} {groupe.label} <span className="font-body text-xs font-normal text-slate-400">({groupe.docs.length})</span>
              </h2>
              <div className="flex flex-col gap-2">
                {groupe.docs.map(d => (
                  <Card key={d.id} padding="sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{emojiTypeDoc(d.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800 truncate">{d.titre}</div>
                        <div className="font-body text-xs text-slate-400">
                          {labelTypeDoc(d.type)}
                          {d.periode ? ` · ${labelPeriode(d.periode)}` : ""}
                          {d.createdAt?.seconds ? ` · déposé le ${new Date(d.createdAt.seconds * 1000).toLocaleDateString("fr-FR")}` : ""}
                        </div>
                      </div>
                      <a href={d.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg no-underline hover:bg-blue-100 flex-shrink-0">
                        <Download size={13} /> Télécharger
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
