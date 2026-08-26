"use client";
import { useState, useEffect } from "react";
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import { FolderLock, Loader2, Trash2, Upload, X, Download } from "lucide-react";
import type { Salarie } from "./types";
import { TYPES_DOC_SALARIE, labelTypeDoc, emojiTypeDoc, labelPeriode, type DocSalarie, type TypeDocSalarie } from "@/lib/docs-salaries";

interface Props {
  salarie: Salarie;
  onClose: () => void;
}

const MAX_MO = 10;

/**
 * Coffre à documents d'un salarié (fiches de paie, attestations…).
 *
 * L'email est la clé d'accès : c'est lui qui donne au collaborateur le droit
 * de lire ses documents dans Admin → Mes documents. Il est prérempli depuis
 * la fiche moniteur (Paramètres → Moniteurs) mais reste modifiable — un
 * salarié non-moniteur n'a pas forcément de fiche.
 */
export default function DocsSalarie({ salarie, onClose }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [docsList, setDocsList] = useState<DocSalarie[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [type, setType] = useState<TypeDocSalarie>("fiche_paie");
  const [periode, setPeriode] = useState(() => new Date().toISOString().slice(0, 7));
  const [titre, setTitre] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDocs = async () => {
    const snap = await getDocs(query(collection(db, "documents-salaries"), where("salarieId", "==", salarie.id)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as DocSalarie[];
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setDocsList(list);
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchDocs();
        // Préremplir l'email depuis la fiche moniteur liée (moniteurId, sinon le nom)
        const monSnap = await getDocs(collection(db, "moniteurs"));
        const moniteurs = monSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        const match = moniteurs.find(m => m.id === (salarie as any).moniteurId)
          || moniteurs.find(m => (m.name || "").toLowerCase().trim() === salarie.nom.toLowerCase().trim());
        if (match?.email) setEmail(String(match.email).toLowerCase());
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [salarie.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const titreParDefaut = () => {
    if (type === "fiche_paie") return `Fiche de paie — ${labelPeriode(periode) || periode}`;
    return labelTypeDoc(type);
  };

  const upload = async () => {
    const emailClean = email.trim().toLowerCase();
    if (!file) { toast("Choisissez un fichier.", "error"); return; }
    if (!emailClean || !emailClean.includes("@")) { toast("Renseignez l'email du salarié : c'est lui qui lui donne accès au document.", "error"); return; }
    if (file.size > MAX_MO * 1024 * 1024) { toast(`Fichier trop lourd (max ${MAX_MO} Mo).`, "error"); return; }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `documents-salaries/${emailClean}/${Date.now()}_${safeName}`;
      const task = uploadBytesResumable(ref(storage, storagePath), file);
      await new Promise<void>((resolve, reject) => { task.on("state_changed", null, reject, () => resolve()); });
      const url = await getDownloadURL(task.snapshot.ref);

      await addDoc(collection(db, "documents-salaries"), {
        salarieId: salarie.id,
        salarieNom: salarie.nom,
        email: emailClean,
        type,
        titre: titre.trim() || titreParDefaut(),
        ...(type === "fiche_paie" && periode ? { periode } : {}),
        fileName: file.name,
        url,
        storagePath,
        size: file.size,
        uploadedBy: user?.email || "",
        createdAt: serverTimestamp(),
      });

      setFile(null);
      setTitre("");
      await fetchDocs();
      toast("Document déposé — visible par le salarié dans « Mes documents ».", "success");
    } catch (e) {
      console.error(e);
      toast("Erreur lors du dépôt du document.", "error");
    }
    setUploading(false);
  };

  const supprimer = async (d: DocSalarie) => {
    if (!confirm(`Supprimer « ${d.titre} » ?\n\nLe salarié n'y aura plus accès.`)) return;
    setDeletingId(d.id);
    try {
      // Le fichier d'abord ; si Storage a déjà perdu l'objet, on nettoie
      // quand même la métadonnée pour ne pas laisser une ligne fantôme.
      try { await deleteObject(ref(storage, d.storagePath)); }
      catch (e: any) { if (e?.code !== "storage/object-not-found") throw e; }
      await deleteDoc(doc(db, "documents-salaries", d.id));
      await fetchDocs();
      toast("Document supprimé.", "success");
    } catch (e) {
      console.error(e);
      toast("Erreur lors de la suppression.", "error");
    }
    setDeletingId(null);
  };

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-body text-sm font-semibold text-sky-900 flex items-center gap-2">
          <FolderLock size={15} /> {salarie.nom} — documents personnels
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer bg-white text-slate-400 hover:text-slate-600">
          <X size={14} />
        </button>
      </div>

      <p className="font-body text-[11px] text-sky-800/80">
        Fiches de paie, attestations France Travail, contrats… Chaque document n'est visible que par
        l'admin et par le salarié connecté avec l'email ci-dessous (menu « Mes documents » de son espace).
      </p>

      {loading ? (
        <div className="py-6 text-center"><Loader2 size={20} className="animate-spin text-sky-500 mx-auto" /></div>
      ) : (
        <>
          {/* Formulaire de dépôt */}
          <div className="bg-white rounded-lg border border-sky-100 p-3 flex flex-col gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-body text-xs">
              <label className="flex flex-col gap-1 text-slate-600">Email du salarié (accès)
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom@exemple.fr"
                  className="border border-gray-200 rounded-lg px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1 text-slate-600">Type de document
                <select value={type} onChange={e => setType(e.target.value as TypeDocSalarie)}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                  {TYPES_DOC_SALARIE.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                </select>
              </label>
              {type === "fiche_paie" && (
                <label className="flex flex-col gap-1 text-slate-600">Mois concerné
                  <input type="month" value={periode} onChange={e => setPeriode(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5" />
                </label>
              )}
              <label className="flex flex-col gap-1 text-slate-600">Titre <span className="font-normal text-slate-400">(optionnel — sinon généré)</span>
                <input value={titre} onChange={e => setTitre(e.target.value)} placeholder={titreParDefaut()}
                  className="border border-gray-200 rounded-lg px-2 py-1.5" />
              </label>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)}
                className="font-body text-xs text-slate-600" />
              <button onClick={upload} disabled={uploading || !file}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-xs font-semibold text-white bg-sky-600 border-none cursor-pointer hover:bg-sky-700 disabled:opacity-50">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                Déposer
              </button>
            </div>
            <p className="font-body text-[10px] text-slate-400">PDF ou image, max {MAX_MO} Mo.</p>
          </div>

          {/* Liste des documents */}
          {docsList.length === 0 ? (
            <p className="font-body text-xs text-slate-400 text-center py-2">Aucun document déposé pour l'instant.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {docsList.map(d => (
                <div key={d.id} className="flex items-center gap-2 bg-white rounded-lg border border-sky-100 px-3 py-2">
                  <span className="text-base">{emojiTypeDoc(d.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-xs font-semibold text-blue-800 truncate">{d.titre}</div>
                    <div className="font-body text-[10px] text-slate-400 truncate">
                      {labelTypeDoc(d.type)}
                      {d.periode ? ` · ${labelPeriode(d.periode)}` : ""}
                      {d.createdAt?.seconds ? ` · déposé le ${new Date(d.createdAt.seconds * 1000).toLocaleDateString("fr-FR")}` : ""}
                      {` · ${d.email}`}
                    </div>
                  </div>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" title="Ouvrir"
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-sky-50 hover:text-sky-600 no-underline">
                    <Download size={13} />
                  </a>
                  <button onClick={() => supprimer(d)} disabled={deletingId === d.id} title="Supprimer"
                    className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
                    {deletingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
