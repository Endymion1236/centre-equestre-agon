"use client";
/**
 * src/app/admin/parametres/SectionNotifications.tsx
 *
 * Onglet « Notifications » : événements pour lesquels l'admin reçoit une
 * notification push. Document `settings/notifications` (écrit en merge).
 *
 * Pourquoi séparé : les clés cochées ici (`nouvelle_inscription`, `impaye`, …)
 * sont exactement celles que testent les routes serveur avant d'envoyer un
 * push ; les renommer couperait silencieusement les notifications. Le mode
 * d'emploi affiché au-dessus des cases est utile parce que le vrai blocage
 * n'est presque jamais le réglage, mais l'autorisation du navigateur (et sur
 * iPhone, l'ajout du site à l'écran d'accueil).
 *
 * La sauvegarde réutilise le bandeau vert commun de la page (setSaved).
 */
import { Card } from "@/components/ui";
import { Save, Loader2 } from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import type { NotifSettings } from "./types";

type Props = {
  notifSettings: NotifSettings;
  setNotifSettings: React.Dispatch<React.SetStateAction<NotifSettings>>;
  notifSaving: boolean;
  setNotifSaving: React.Dispatch<React.SetStateAction<boolean>>;
  testPushSending: boolean;
  setTestPushSending: React.Dispatch<React.SetStateAction<boolean>>;
  setSaved: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function SectionNotifications({
  notifSettings, setNotifSettings, notifSaving, setNotifSaving,
  testPushSending, setTestPushSending, setSaved,
}: Props) {
  return (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-1">🔔 Notifications push — Admin</h3>
            <p className="font-body text-xs text-slate-500 mb-4">
              Choisissez les événements pour lesquels vous recevez une notification push sur votre téléphone ou ordinateur.
              Les notifications arrivent même quand l'application est fermée (si vous avez autorisé les notifications dans votre navigateur).
            </p>

            {/* Comment activer */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <div className="font-body text-sm font-semibold text-blue-800 mb-2">📱 Comment activer les notifications ?</div>
              <ol className="font-body text-xs text-blue-700 space-y-1 list-decimal list-inside">
                <li>Ouvrez l'application admin sur votre téléphone ou ordinateur</li>
                <li>Votre navigateur vous demandera <strong>"Autoriser les notifications"</strong> → cliquez <strong>Autoriser</strong></li>
                <li>Si vous avez refusé, allez dans les paramètres de votre navigateur → Site → Notifications → Autoriser</li>
                <li>Sur <strong>iPhone/Safari</strong> : ajoutez d'abord le site à l'écran d'accueil (partage → Sur l'écran d'accueil)</li>
              </ol>
            </div>

            {/* Événements configurables */}
            <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Événements déclencheurs</div>
            <div className="flex flex-col gap-2">
              {([
                ["nouvelle_inscription", "Nouvelle inscription", "Un cavalier s'inscrit à un créneau ou un stage"],
                ["nouveau_paiement", "Nouveau paiement reçu", "Un paiement CB en ligne est confirmé"],
                ["impaye", "Impayé détecté", "Un paiement en attente dépasse 7 jours"],
                ["liste_attente", "Place libérée (liste d'attente)", "Une place se libère et un cavalier en liste d'attente est notifié"],
                ["annulation", "Annulation d'inscription", "Un cavalier annule une réservation"],
                ["nouveau_cavalier", "Nouveau compte cavalier", "Une famille crée un compte depuis l'espace cavalier"],
                ["rappel_stage", "Rappel J-3 stage", "Rappel automatique 3 jours avant un stage"],
              ] as [string, string, string][]).map(([key, label, desc]) => (
                <label key={key} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-sand transition-colors">
                  <input
                    type="checkbox"
                    checked={(notifSettings as any)[key] ?? false}
                    onChange={e => setNotifSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="w-4 h-4 accent-blue-500 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">{label}</div>
                    <div className="font-body text-xs text-slate-500">{desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={async () => {
                setNotifSaving(true);
                try {
                  await setDoc(doc(db, "settings", "notifications"), { ...notifSettings, updatedAt: serverTimestamp() }, { merge: true });
                  setSaved(true); setTimeout(() => setSaved(false), 2000);
                } catch (e: any) { alert("Erreur : " + e.message); }
                setNotifSaving(false);
              }} disabled={notifSaving}
                className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50">
                {notifSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Enregistrer
              </button>
              <button onClick={async () => {
                setTestPushSending(true);
                try {
                  const res = await authFetch("/api/push", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      broadcast: true,
                      title: "🐴 Test notification",
                      body: "Les notifications push fonctionnent correctement !",
                    }),
                  });
                  const data = await res.json();
                  alert(data.sent > 0 ? `✅ Notification envoyée à ${data.sent} appareil(s)` : "⚠️ Aucun appareil enregistré. Autorisez d'abord les notifications.");
                } catch { alert("Erreur lors de l'envoi"); }
                setTestPushSending(false);
              }} disabled={testPushSending}
                className="flex items-center gap-2 font-body text-sm font-semibold text-blue-600 bg-blue-50 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 disabled:opacity-50">
                {testPushSending ? <Loader2 size={14} className="animate-spin" /> : "📱"}
                Tester une notification
              </button>
            </div>
          </Card>
        </div>
  );
}
