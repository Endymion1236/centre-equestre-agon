"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { MessageCircle, Loader2, Save } from "lucide-react";

const dayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Début de la saison 2026-2027. On ne liste que les reprises à partir de cette
// date (les créneaux d'été, stages et anciens créneaux sont ignorés).
const SAISON_DEBUT = "2026-09-21";

// Clé de reprise stable, identique à l'inscription annuelle (hors saison) :
// activité + jour de la semaine + heure de début.
function repriseKey(activityId: string, dow: number, startTime: string) {
  return `${activityId}-${dow}-${startTime}`;
}

interface RepriseInfo {
  key: string;
  label: string;
  dow: number;
  startTime: string;
}

export default function WhatsAppAdminPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [communityUrl, setCommunityUrl] = useState("");
  const [reprises, setReprises] = useState<RepriseInfo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        // Reprises dérivées des créneaux (hors stages), dédupliquées.
        const cSnap = await getDocs(collection(db, "creneaux"));
        const map: Record<string, RepriseInfo> = {};
        cSnap.docs.forEach((d) => {
          const c = d.data() as any;
          if (c.activityType === "stage" || c.activityType === "stage_journee") return;
          if (!c.activityId || !c.date || !c.startTime) return;
          if (c.date < SAISON_DEBUT) return; // saison 2026-2027 uniquement
          const dow = (new Date(c.date).getDay() + 6) % 7;
          const key = repriseKey(c.activityId, dow, c.startTime);
          if (!map[key]) {
            map[key] = { key, dow, startTime: c.startTime, label: `${c.activityTitle} · ${dayLabels[dow]} · ${c.startTime}` };
          }
        });
        const list = Object.values(map).sort((a, b) => (a.dow - b.dow) || a.startTime.localeCompare(b.startTime));
        setReprises(list);

        // Config existante
        const wSnap = await getDoc(doc(db, "settings", "whatsapp"));
        if (wSnap.exists()) {
          const w = wSnap.data() as any;
          setCommunityUrl(w.communityUrl || "");
          setUrls(w.reprises || {});
        }
      } catch (e) {
        console.error(e);
        toast("Erreur de chargement", "error");
      }
      setLoading(false);
    })();
  }, [toast]);

  const filledCount = useMemo(() => Object.values(urls).filter((u) => (u || "").trim()).length, [urls]);

  const isValidUrl = (u: string) => !u.trim() || /^https:\/\/chat\.whatsapp\.com\//i.test(u.trim());
  const communityValid = isValidUrl(communityUrl);
  const allValid = communityValid && reprises.every((r) => isValidUrl(urls[r.key] || ""));

  const save = async () => {
    if (!allValid) { toast("Certains liens ne sont pas des liens d'invitation WhatsApp (https://chat.whatsapp.com/…)", "error"); return; }
    setSaving(true);
    try {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(urls)) { if ((v || "").trim()) cleaned[k] = v.trim(); }
      await setDoc(doc(db, "settings", "whatsapp"), { communityUrl: communityUrl.trim(), reprises: cleaned }, { merge: true });
      toast("✅ Liens WhatsApp enregistrés", "success");
    } catch (e) {
      console.error(e);
      toast("Erreur à l'enregistrement", "error");
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center">
          <MessageCircle size={18} className="text-white" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Groupes WhatsApp</h1>
          <p className="font-body text-xs text-slate-600">Liens d&apos;invitation que les familles retrouveront dans leur espace</p>
        </div>
      </div>

      {loading ? (
        <p className="font-body text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-4 max-w-2xl">
          <Card>
            <p className="font-body text-sm font-bold text-blue-800 mb-1">Communauté du centre</p>
            <p className="font-body text-xs text-slate-500 mb-2">Lien du groupe/communauté WhatsApp de tout le centre, proposé à toutes les familles.</p>
            <input
              value={communityUrl}
              onChange={(e) => setCommunityUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/…"
              className={`w-full px-3 py-2 rounded-lg border font-body text-sm bg-white focus:outline-none ${communityValid ? "border-gray-200 focus:border-green-500" : "border-red-300"}`}
            />
            {!communityValid && <p className="font-body text-[11px] text-red-600 mt-1">Doit commencer par https://chat.whatsapp.com/</p>}
          </Card>

          <Card>
            <p className="font-body text-sm font-bold text-blue-800 mb-1">Par reprise <span className="font-normal text-slate-400">({filledCount}/{reprises.length} renseignées)</span></p>
            <p className="font-body text-xs text-slate-500 mb-3">Reprises de la saison 2026-2027 (à partir du 21 septembre). Colle le lien d&apos;invitation du groupe WhatsApp de chaque reprise. Laisse vide s&apos;il n&apos;y a pas de groupe. Astuce : dans WhatsApp, ouvre le groupe → Infos du groupe → « Inviter via un lien ».</p>
            {reprises.length === 0 ? (
              <p className="font-body text-xs text-slate-400">Aucune reprise trouvée dans le planning.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {reprises.map((r) => {
                  const val = urls[r.key] || "";
                  const ok = isValidUrl(val);
                  return (
                    <div key={r.key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-body text-xs text-slate-700 sm:w-56 shrink-0">{r.label}</span>
                      <input
                        value={val}
                        onChange={(e) => setUrls((u) => ({ ...u, [r.key]: e.target.value }))}
                        placeholder="https://chat.whatsapp.com/…"
                        className={`flex-1 px-3 py-2 rounded-lg border font-body text-xs bg-white focus:outline-none ${ok ? "border-gray-200 focus:border-green-500" : "border-red-300"}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <button
            onClick={save}
            disabled={saving || !allValid}
            className="self-start flex items-center gap-2 px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-500 border-none cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}
