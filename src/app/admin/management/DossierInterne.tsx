"use client";
import { useState, useEffect } from "react";
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import { ChevronDown, ChevronUp, Download, Loader2, ShieldAlert, Trash2, Upload } from "lucide-react";
import type { Salarie } from "./types";
import {
  TYPES_DOC_INTERNE, labelTypeInterne, emojiTypeInterne, sanctionPrescrite,
  type DocInterne, type TypeDocInterne,
} from "@/lib/docs-salaries";

interface Props {
  salarie: Salarie;
}

const MAX_MO = 10;

/**
 * Dossier interne employeur d'un salarié : copies des remises en main propre
 * signées, preuves de dépôt/AR, convocations, sanctions, comptes rendus.
 *
 * STRICTEMENT admin : collection et chemin Storage dédiés, sans email
 * d'accès — contrairement aux « documents personnels », le salarié ne voit
 * jamais ces pièces. Le dépôt ici ne vaut PAS notification : la remise
 * officielle (main propre contre décharge ou LRAR) reste le circuit légal,
 * ce dossier n'en conserve que les preuves.
 */
export default function DossierInterne({ salarie }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [docsList, setDocsList] = useState<DocInterne[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<TypeDocInterne>("remise_signee");
  const [dateDocument, setDateDocument] = useState(() => new Date().toISOString().slice(0, 10));
  const [titre, setTitre] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDocs = async () => {
    const snap = await getDocs(query(collection(db, "dossier-interne-salaries"), where("salarieId", "==", salarie.id)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as DocInterne[];
    // Tri par date du document (la chronologie de la procédure), les plus récentes d'abord
    list.sort((a, b) => (b.dateDocument || "").localeCompare(a.dateDocument || "")
      || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setDocsList(list);
  };

  useEffect(() => {
    (async () => {
      try { await fetchDocs(); } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [salarie.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async () => {
    if (files.length === 0) { toast("Choisissez un fichier (ou des photos).", "error"); return; }
    const tropLourd = files.find(f => f.size > MAX_MO * 1024 * 1024);
    if (tropLourd) { toast(`« ${tropLourd.name} » est trop lourd (max ${MAX_MO} Mo par fichier).`, "error"); return; }

    setUploading(true);
    try {
      const titreBase = titre.trim() || labelTypeInterne(type);
      let deposes = 0;
      for (const [index, f] of files.entries()) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `dossier-interne-salaries/${salarie.id}/${Date.now()}_${index}_${safeName}`;
        const task = uploadBytesResumable(ref(storage, storagePath), f);
        await new Promise<void>((resolve, reject) => { task.on("state_changed", null, reject, () => resolve()); });
        const url = await getDownloadURL(task.snapshot.ref);

        await addDoc(collection(db, "dossier-interne-salaries"), {
          salarieId: salarie.id,
          salarieNom: salarie.nom,
          type,
          titre: files.length > 1 ? `${titreBase} (page ${index + 1}/${files.length})` : titreBase,
          ...(dateDocument ? { dateDocument } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          fileName: f.name,
          url,
          storagePath,
          size: f.size,
          uploadedBy: user?.email || "",
          createdAt: serverTimestamp(),
        });
        deposes++;
      }

      setFiles([]);
      setInputKey(k => k + 1);
      setTitre("");
      setNote("");
      await fetchDocs();
      toast(deposes > 1 ? `${deposes} pages classées au dossier interne.` : "Pièce classée au dossier interne.", "success");
    } catch (e) {
      console.error(e);
      toast("Erreur lors du dépôt — vérifiez la liste : certaines pages ont pu être déposées avant l'erreur.", "error");
      await fetchDocs().catch(() => {});
    }
    setUploading(false);
  };

  const supprimer = async (d: DocInterne) => {
    if (!confirm(`Purger « ${d.titre} » du dossier interne ?\n\nSuppression définitive.`)) return;
    setDeletingId(d.id);
    try {
      try { await deleteObject(ref(storage, d.storagePath)); }
      catch (e: any) { if (e?.code !== "storage/object-not-found") throw e; }
      await deleteDoc(doc(db, "dossier-interne-salaries", d.id));
      await fetchDocs();
      toast("Pièce purgée.", "success");
    } catch (e) {
      console.error(e);
      toast("Erreur lors de la suppression.", "error");
    }
    setDeletingId(null);
  };

  const prescrites = docsList.filter(sanctionPrescrite).length;

  return (
    <div className="bg-amber-50/70 border border-amber-200 rounded-xl">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-transparent border-none cursor-pointer text-left">
        <div className="font-body text-sm font-semibold text-amber-900 flex items-center gap-2">
          <ShieldAlert size={15} /> Dossier interne employeur
          {docsList.length > 0 && <span className="font-normal text-xs text-amber-700">({docsList.length} pièce{docsList.length > 1 ? "s" : ""})</span>}
          {prescrites > 0 && (
            <span className="font-body text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
              {prescrites} sanction{prescrites > 1 ? "s" : ""} prescrite{prescrites > 1 ? "s" : ""} à purger
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-amber-700" /> : <ChevronDown size={15} className="text-amber-700" />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <p className="font-body text-[11px] text-amber-800/90">
            Visible <strong>uniquement par l'admin</strong> — jamais par le salarié. Classez-y les copies des remises en
            main propre signées, preuves de dépôt/AR, convocations, sanctions… ⚠️ Le dépôt ici ne vaut pas notification :
            la remise officielle (décharge signée ou LRAR) reste indispensable ; ce dossier en garde la preuve.
          </p>

          {loading ? (
            <div className="py-4 text-center"><Loader2 size={18} className="animate-spin text-amber-500 mx-auto" /></div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-amber-100 p-3 flex flex-col gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-body text-xs">
                  <label className="flex flex-col gap-1 text-slate-600">Type de pièce
                    <select value={type} onChange={e => setType(e.target.value as TypeDocInterne)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                      {TYPES_DOC_INTERNE.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Date du document
                    <input type="date" value={dateDocument} onChange={e => setDateDocument(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Titre <span className="font-normal text-slate-400">(optionnel)</span>
                    <input value={titre} onChange={e => setTitre(e.target.value)} placeholder={labelTypeInterne(type)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1 text-slate-600">Note <span className="font-normal text-slate-400">(optionnel)</span>
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex. remis le 26/08 devant témoin"
                      className="border border-gray-200 rounded-lg px-2 py-1.5" />
                  </label>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input key={inputKey} type="file" accept=".pdf,image/*" multiple
                    onChange={e => setFiles(Array.from(e.target.files || []))}
                    className="font-body text-xs text-slate-600" />
                  <button type="button" onClick={upload} disabled={uploading || files.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-body text-xs font-semibold text-white bg-amber-600 border-none cursor-pointer hover:bg-amber-700 disabled:opacity-50">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {files.length > 1 ? `Classer ${files.length} pages` : "Classer au dossier"}
                  </button>
                </div>
                <p className="font-body text-[10px] text-slate-400">PDF ou photo, max {MAX_MO} Mo par fichier.</p>
              </div>

              {docsList.length === 0 ? (
                <p className="font-body text-xs text-slate-400 text-center py-1">Dossier vide.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {docsList.map(d => {
                    const prescrite = sanctionPrescrite(d);
                    return (
                      <div key={d.id} className={`flex items-center gap-2 bg-white rounded-lg border px-3 py-2 ${prescrite ? "border-red-200" : "border-amber-100"}`}>
                        <span className="text-base">{emojiTypeInterne(d.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-xs font-semibold text-blue-800 truncate">
                            {d.titre}
                            {prescrite && (
                              <span className="ml-2 font-body text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded" title="Plus de 3 ans (art. L.1332-5) : ne peut plus être invoquée — à purger">
                                Prescrite — à purger
                              </span>
                            )}
                          </div>
                          <div className="font-body text-[10px] text-slate-400 truncate">
                            {labelTypeInterne(d.type)}
                            {d.dateDocument ? ` · daté du ${new Date(`${d.dateDocument}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}
                            {d.createdAt?.seconds ? ` · classé le ${new Date(d.createdAt.seconds * 1000).toLocaleDateString("fr-FR")}` : ""}
                            {d.note ? ` · ${d.note}` : ""}
                          </div>
                        </div>
                        <a href={d.url} target="_blank" rel="noopener noreferrer" title="Ouvrir"
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600 no-underline">
                          <Download size={13} />
                        </a>
                        <button type="button" onClick={() => supprimer(d)} disabled={deletingId === d.id} title="Purger (suppression définitive)"
                          className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
                          {deletingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
