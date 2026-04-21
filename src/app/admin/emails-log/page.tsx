"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Search, Mail, CheckCircle2, XCircle, RefreshCw, Filter, TrendingUp, AlertTriangle } from "lucide-react";

// Libellés contextes → affichage humain
const CONTEXT_LABELS: Record<string, string> = {
  // Crons
  cron_rappel_j1: "Rappel J-1 (cron)",
  cron_monitor_recap: "Récap moniteur (cron)",
  cron_stage_solde: "Solde stage J-7 (cron)",
  // Webhooks
  cawl_webhook: "Paiement CAWL (webhook)",
  cawl_status_check: "Paiement CAWL (retour)",
  payment_link: "Lien de paiement",
  // Admin (appels send-email avec context précisé)
  admin_manual: "Manuel (admin)",
  admin_confirmation_stage: "Inscription stage",
  admin_confirmation_cours: "Réservation cours",
  admin_confirmation_forfait: "Forfait annuel",
  admin_confirmation_paiement: "Confirmation paiement",
  admin_rappel_impaye: "Rappel impayé",
  admin_bienvenue_famille: "Bienvenue nouvelle famille",
  admin_desinscription_avoir: "Désinscription + avoir",
  admin_place_liberee: "Place libérée",
  admin_email_reprise: "Email groupe (reprise)",
  admin_communication: "Communication ciblée",
  admin_devis: "Envoi devis",
  admin_planning_moniteur: "Planning moniteur",
  admin_rappel_montoir: "Rappel cours (depuis montoir)",
  admin_bilan_progression: "Bilan de progression",
  espace_cavalier_reservation: "Réservation espace cavalier",
  espace_cavalier_satisfaction: "Demande satisfaction",
  espace_cavalier_facture: "Demande facture",
  unknown: "Inconnu",
};

interface EmailLog {
  id: string;
  to: string;
  recipientCount?: number;
  subject: string;
  context: string;
  template?: string;
  status: "sent" | "failed";
  error?: string;
  familyId?: string;
  paymentId?: string;
  creneauId?: string;
  sentBy?: string;
  sentAt?: any;
  createdAt?: any;
}

export default function EmailsLogPage() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtres
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed">("all");
  const [contextFilter, setContextFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);

  const fetchLogs = async () => {
    setRefreshing(true);
    try {
      // Charge les 500 derniers par défaut
      const q = query(collection(db, "emailsSent"), orderBy("sentAt", "desc"), limit(500));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })) as EmailLog[]);
    } catch (e) {
      console.error("[emails-log] fetch:", e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  // Contextes uniques pour le filtre
  const availableContexts = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => set.add(l.context || "unknown"));
    return [...set].sort();
  }, [logs]);

  // Filtrage
  const filtered = useMemo(() => {
    let arr = logs;
    if (statusFilter !== "all") arr = arr.filter(l => l.status === statusFilter);
    if (contextFilter !== "all") arr = arr.filter(l => l.context === contextFilter);
    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00").getTime();
      arr = arr.filter(l => {
        const t = l.sentAt?.seconds ? l.sentAt.seconds * 1000 : 0;
        return t >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59").getTime();
      arr = arr.filter(l => {
        const t = l.sentAt?.seconds ? l.sentAt.seconds * 1000 : 0;
        return t <= to;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(l =>
        (l.to || "").toLowerCase().includes(q) ||
        (l.subject || "").toLowerCase().includes(q) ||
        (l.template || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [logs, statusFilter, contextFilter, dateFrom, dateTo, search]);

  // Stats
  const stats = useMemo(() => {
    const now = Date.now();
    const d7 = now - 7 * 24 * 60 * 60 * 1000;
    const d24 = now - 24 * 60 * 60 * 1000;
    let total = 0, sent = 0, failed = 0, last7 = 0, last24 = 0, failed7 = 0;
    for (const l of logs) {
      total++;
      const t = l.sentAt?.seconds ? l.sentAt.seconds * 1000 : 0;
      if (l.status === "sent") sent++;
      else if (l.status === "failed") failed++;
      if (t > d7) last7++;
      if (t > d24) last24++;
      if (t > d7 && l.status === "failed") failed7++;
    }
    return { total, sent, failed, last7, last24, failed7 };
  }, [logs]);

  const formatDate = (ts: any): string => {
    if (!ts) return "—";
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Journal des emails</h1>
          <p className="font-body text-sm text-slate-500 mt-1">Historique centralisé — conservation 90 jours</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={refreshing}
          className="flex items-center gap-2 font-body text-sm text-blue-500 bg-blue-50 hover:bg-blue-100 border-none px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50">
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Rafraîchir
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Card padding="sm">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Total</div>
          <div className="font-body text-2xl font-bold text-blue-800 mt-1">{stats.total}</div>
          <div className="font-body text-[10px] text-slate-400">derniers 500</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Envoyés</div>
          <div className="font-body text-2xl font-bold text-green-600 mt-1">{stats.sent}</div>
          <div className="font-body text-[10px] text-slate-400">{stats.total > 0 ? `${Math.round(stats.sent / stats.total * 100)}% de succès` : "—"}</div>
        </Card>
        <Card padding="sm" className={stats.failed > 0 ? "border-red-200 bg-red-50/40" : ""}>
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Échecs</div>
          <div className={`font-body text-2xl font-bold mt-1 ${stats.failed > 0 ? "text-red-500" : "text-slate-400"}`}>{stats.failed}</div>
          <div className="font-body text-[10px] text-slate-400">{stats.failed7 > 0 ? `${stats.failed7} sur 7j` : "aucun récent"}</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Dernières 24h</div>
          <div className="font-body text-2xl font-bold text-blue-500 mt-1">{stats.last24}</div>
          <div className="font-body text-[10px] text-slate-400">envois</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">7 derniers jours</div>
          <div className="font-body text-2xl font-bold text-blue-500 mt-1">{stats.last7}</div>
          <div className="font-body text-[10px] text-slate-400">envois</div>
        </Card>
      </div>

      {/* Filtres */}
      <Card padding="sm" className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Destinataire, sujet, template..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex gap-1">
            {[
              { id: "all", label: "Tous" },
              { id: "sent", label: "Envoyés" },
              { id: "failed", label: `Échecs${stats.failed > 0 ? ` (${stats.failed})` : ""}` },
            ].map(f => (
              <button key={f.id} onClick={() => setStatusFilter(f.id as any)}
                className={`font-body text-xs px-3 py-2 rounded-lg border cursor-pointer ${statusFilter === f.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200 hover:bg-slate-50"}`}>
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={contextFilter}
            onChange={e => setContextFilter(e.target.value)}
            className="font-body text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white cursor-pointer focus:outline-none focus:border-blue-400">
            <option value="all">Tous contextes</option>
            {availableContexts.map(c => (
              <option key={c} value={c}>{CONTEXT_LABELS[c] || c}</option>
            ))}
          </select>
          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="font-body text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-400"
            placeholder="Du"
            title="Date début"
          />
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="font-body text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-400"
            placeholder="Au"
            title="Date fin"
          />
          {(search || statusFilter !== "all" || contextFilter !== "all" || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); setContextFilter("all"); setDateFrom(""); setDateTo(""); }}
              className="font-body text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-red-100">
              Réinitialiser
            </button>
          )}
        </div>
      </Card>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Mail size={32} className="text-slate-300 mx-auto mb-2" />
          <p className="font-body text-sm text-slate-500">
            {logs.length === 0 ? "Aucun email enregistré pour l'instant." : "Aucun email ne correspond aux filtres."}
          </p>
        </Card>
      ) : (
        <Card padding="sm">
          <div className="font-body text-[11px] text-slate-500 uppercase tracking-wider mb-2 px-2">
            {filtered.length} email{filtered.length > 1 ? "s" : ""}
          </div>
          <div className="flex flex-col gap-1 max-h-[600px] overflow-y-auto">
            {filtered.map(log => {
              const isFail = log.status === "failed";
              const ctxLabel = CONTEXT_LABELS[log.context] || log.context;
              return (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`text-left flex items-start gap-3 px-3 py-2 rounded-lg border-none cursor-pointer transition-colors ${isFail ? "bg-red-50/40 hover:bg-red-50" : "bg-white hover:bg-slate-50"}`}>
                  <div className="flex-shrink-0 mt-0.5">
                    {isFail ? <XCircle size={16} className="text-red-500" /> : <CheckCircle2 size={16} className="text-green-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-body text-sm font-semibold truncate ${isFail ? "text-red-700" : "text-blue-800"}`}>{log.subject || "(sans sujet)"}</span>
                      <Badge color={isFail ? "red" : "blue"}>{ctxLabel}</Badge>
                    </div>
                    <div className="font-body text-xs text-slate-500 mt-0.5 truncate">
                      → {log.to}
                      {log.recipientCount && log.recipientCount > 1 ? ` (+${log.recipientCount - 1})` : ""}
                    </div>
                    {isFail && log.error && (
                      <div className="font-body text-[11px] text-red-600 mt-1 truncate">⚠ {log.error}</div>
                    )}
                  </div>
                  <div className="font-body text-[11px] text-slate-400 flex-shrink-0">
                    {formatDate(log.sentAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Modal détail */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-base font-bold text-blue-800">Détail de l'envoi</h2>
              <button onClick={() => setSelectedLog(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {selectedLog.status === "failed"
                  ? <><XCircle size={18} className="text-red-500" /><span className="font-body text-sm font-semibold text-red-700">Échec</span></>
                  : <><CheckCircle2 size={18} className="text-green-500" /><span className="font-body text-sm font-semibold text-green-700">Envoyé</span></>}
              </div>
              <div>
                <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Sujet</div>
                <div className="font-body text-sm text-blue-800 mt-1">{selectedLog.subject || "—"}</div>
              </div>
              <div>
                <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Destinataire(s)</div>
                <div className="font-body text-sm text-slate-700 mt-1 break-words">{selectedLog.to}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Contexte</div>
                  <div className="font-body text-sm text-slate-700 mt-1">{CONTEXT_LABELS[selectedLog.context] || selectedLog.context}</div>
                </div>
                <div>
                  <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Template</div>
                  <div className="font-body text-sm text-slate-700 mt-1">{selectedLog.template || "—"}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Date</div>
                  <div className="font-body text-sm text-slate-700 mt-1">{formatDate(selectedLog.sentAt)}</div>
                </div>
                <div>
                  <div className="font-body text-[10px] text-slate-500 uppercase tracking-wider">Déclenché par</div>
                  <div className="font-body text-sm text-slate-700 mt-1">{selectedLog.sentBy === "system" ? "Système (cron)" : selectedLog.sentBy || "—"}</div>
                </div>
              </div>
              {selectedLog.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="font-body text-[10px] text-red-600 uppercase tracking-wider">Erreur</div>
                  <div className="font-body text-xs text-red-700 mt-1 break-words">{selectedLog.error}</div>
                </div>
              )}
              {(selectedLog.familyId || selectedLog.paymentId || selectedLog.creneauId) && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
                  {selectedLog.familyId && <span className="font-body text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded">Famille: {selectedLog.familyId.slice(0, 8)}…</span>}
                  {selectedLog.paymentId && <span className="font-body text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded">Paiement: {selectedLog.paymentId.slice(0, 8)}…</span>}
                  {selectedLog.creneauId && <span className="font-body text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded">Créneau: {selectedLog.creneauId.slice(0, 8)}…</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
