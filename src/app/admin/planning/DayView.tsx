"use client";
/**
 * src/app/admin/planning/DayView.tsx
 *
 * Vue « Jour » du planning : navigation veille / lendemain, bandeau marées,
 * puis la liste des créneaux de la journée avec, sous chacun, la pastille de
 * chaque cavalier inscrit et son statut de règlement.
 *
 * Pourquoi ces pastilles comptent : c'est le seul endroit où l'admin voit,
 * d'un coup d'œil sur la journée, qui a payé et qui n'a pas payé. Le calcul du
 * statut (carte, Celeris, forfait réglé, forfait à régler, réglé, en attente,
 * non réglé) est repris ici À L'IDENTIQUE de la page — y compris le décompte
 * d'impayés affiché en haut de la carte, qui applique exactement les mêmes
 * tests. Toute divergence entre les deux ferait afficher « 2 impayés » avec
 * deux pastilles vertes en dessous.
 *
 * Le composant n'écrit rien : ouvrir les réglages, supprimer ou ouvrir le
 * panneau d'inscription reste l'affaire de la page.
 */

import { ChevronLeft, ChevronRight, Loader2, CalendarDays, Trash2, Settings } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import MareesBandeau from "@/components/MareesBandeau";
import { Creneau, typeColors, fmtDate, itemMatchesCreneau, isForfaitChildPaye } from "./types";
import { calcAge } from "./enroll-helpers";
import type { Family } from "@/types";

export default function DayView({
  loading, currentDay, dayCreneaux, payments, families, waitCounts,
  setDayOffset, setSelectedCreneau, setEditCreneau, setEditForm, setEditApplyAll, openDelete,
}: {
  loading: boolean;
  currentDay: Date;
  dayCreneaux: (Creneau & { id: string })[];
  payments: any[];
  families: (Family & { firestoreId: string })[];
  waitCounts: Record<string, number>;
  setDayOffset: (v: number | ((d: number) => number)) => void;
  setSelectedCreneau: (c: any) => void;
  setEditCreneau: (c: any) => void;
  setEditForm: (f: any) => void;
  setEditApplyAll: (v: boolean) => void;
  openDelete: (c: Creneau & { id: string }) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <button onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Veille</button>
        <div className="flex flex-col items-center gap-1">
          <div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
          <div className="font-body text-xs text-slate-600">{dayCreneaux.length} créneau{dayCreneaux.length>1?"x":""}</div>
          <input type="date" title="Aller à cette date"
            className="font-body text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white cursor-pointer focus:border-blue-400 focus:outline-none text-slate-500"
            onChange={e => {
              const v = e.target.value;
              if (!v) return;
              // Le champ émet un événement à CHAQUE frappe : en tapant
              // « 01/09/2026 », le navigateur envoie d'abord 0001-09-01,
              // puis 0019-…, 0192-…, 0202-… avant la bonne valeur. On
              // partait alors sur une année aberrante (1902, 1926) et le
              // champ se vidait avant la fin de la saisie.
              const [py2, pm2, pd2] = v.split("-").map(Number);
              if (!py2 || !pm2 || !pd2) return;
              if (py2 < 2000 || py2 > 2100) return; // saisie encore en cours
              const picked = new Date(py2, pm2 - 1, pd2);
              if (Number.isNaN(picked.getTime())) return;
              const today = new Date(); today.setHours(0,0,0,0);
              setDayOffset(Math.round((picked.getTime() - today.getTime()) / 86400000));
            }}/>
        </div>
        <div className="flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain<ChevronRight size={16}/></button></div>
      </div>
      <MareesBandeau date={fmtDate(currentDay)} />
      {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
      dayCreneaux.length===0?<Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><CalendarDays size={28} className="text-blue-300" /></div><p className="font-body text-sm text-slate-600">Aucun créneau.</p></Card>:
      <div className="flex flex-col gap-3">{dayCreneaux.map(c=>{const en=c.enrolled||[];const fill=c.maxPlaces>0?en.length/c.maxPlaces:0;const col=(c as any).color||typeColors[c.activityType]||"#666";const ttc=(c as any).priceTTC||(c.priceHT||0)*(1+(c.tvaTaux||5.5)/100);return(
        <Card key={c.id} padding="md" className="cursor-pointer hover:shadow-lg" hover>
          <div onClick={()=>setSelectedCreneau(c)}>
            <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-4"><div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-slate-600">{c.endTime}</div></div><div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-slate-600">{c.monitor} · {c.maxPlaces} pl.{ttc>0?` · ${ttc.toFixed(0)}€`:""}{(c as any).allowDayBooking&&<span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 align-middle" title="Ce jour est réservable à l'unité par les familles">📅 journée{(c as any).priceTTCDay>0?` ${Number((c as any).priceTTCDay).toFixed(0)}€`:""}</span>}</div></div></div><div className="flex items-center gap-2">{(()=>{const unpaid=en.filter((e:any)=>{const isCard=e.paymentSource==="card";const isCeleris=e.paymentSource==="celeris";const isForfait=e.paymentSource==="forfait";const isForfaitPaid=isForfait&&isForfaitChildPaye(payments,e.familyId,e.childId);const isForfaitPending=isForfait&&!isForfaitPaid;const matchesThis=(i:any)=>itemMatchesCreneau(i,e,c);const hp=isCard||isCeleris||isForfaitPaid||payments.some((p:any)=>p.familyId===e.familyId&&p.status==="paid"&&(p.items||[]).some(matchesThis));const hpend=!hp&&!isCard&&!isCeleris&&(isForfaitPending||payments.some((p:any)=>p.familyId===e.familyId&&(p.status==="pending"||p.status==="partial")&&(p.items||[]).some(matchesThis)));return!hp&&!hpend&&!isCard&&!isCeleris;}).length;return unpaid>0?<span className="font-body text-xs font-semibold text-red-500 bg-red-50 px-2 py-1 rounded-lg">⚠️ {unpaid} impayé{unpaid>1?"s":""}</span>:null;})()}{waitCounts[c.id]>0&&<span className="font-body text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-1 rounded-lg whitespace-nowrap" title="Enfants en liste d'attente sur ce créneau">🔔 {waitCounts[c.id]} en attente</span>}<Badge color={fill>=1?"red":fill>=0.7?"orange":"green"}>{en.length}/{c.maxPlaces}</Badge><button onClick={e=>{e.stopPropagation();setEditCreneau(c);setEditForm({date:c.date,activityId:(c as any).activityId||"",activityType:c.activityType,tvaTaux:(c as any).tvaTaux||5.5,activityTitle:c.activityTitle,monitor:c.monitor||"",startTime:c.startTime,endTime:c.endTime,maxPlaces:c.maxPlaces,priceTTC:(c as any).priceTTC||0,color:(c as any).color||"",allowDayBooking:(c as any).allowDayBooking||false,priceTTCDay:(c as any).priceTTCDay||"",themeStage:(c as any).themeStage||""});setEditApplyAll(false);}} className="text-blue-400 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center"><Settings size={15}/></button><button onClick={e=>{e.stopPropagation();openDelete(c);}} className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={16}/></button></div></div>
            {en.length>0&&<div className="ml-[68px] flex flex-wrap gap-2">{en.map((e:any)=>{
              const isCard = e.paymentSource === "card";
              const isCeleris = e.paymentSource === "celeris";
              const isForfait = e.paymentSource === "forfait";
              const isForfaitPaid = isForfait && isForfaitChildPaye(payments, e.familyId, e.childId);
              const isForfaitPending = isForfait && !isForfaitPaid;
              const matchesThis = (i: any) => itemMatchesCreneau(i, e, c);
              const hasPaid = isCard || isCeleris || isForfaitPaid || payments.some((p: any) => p.familyId === e.familyId && p.status === "paid" && (p.items||[]).some(matchesThis));
              const hasPending = !hasPaid && !isCard && !isCeleris && (isForfaitPending || payments.some((p: any) => p.familyId === e.familyId && (p.status === "pending" || p.status === "partial") && (p.items||[]).some(matchesThis)));
              const statusColor = isCard ? "#2050A0" : isCeleris ? "#0d9488" : isForfaitPaid ? "#059669" : isForfaitPending ? "#d97706" : hasPaid ? "#16a34a" : hasPending ? "#d97706" : "#9ca3af";
              const statusBg   = isCard ? "#EDF2FA"  : isCeleris ? "#f0fdfa" : isForfaitPaid ? "#ecfdf5" : isForfaitPending ? "#fffbeb" : hasPaid ? "#f0fdf4"  : hasPending ? "#fffbeb"  : "#f3f4f6";
              const statusIcon = isCard ? "🎟️" : isCeleris ? "✓" : isForfaitPaid ? "📅" : isForfaitPending ? "⏳" : hasPaid ? "✓" : hasPending ? "…" : "—";
              const statusLabel = isCard ? "carte" : isCeleris ? "réglé (Celeris)" : isForfaitPaid ? "forfait" : isForfaitPending ? "forfait à régler" : hasPaid ? "réglé" : hasPending ? "en attente" : "non réglé";
              const famForChild = families.find((f:any) => f.firestoreId === e.familyId);
              const childRec = (famForChild?.children || []).find((c:any) => c.id === e.childId);
              const age = calcAge(childRec?.birthDate);
              return <span key={e.childId} className="font-body text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1.5 border"
                style={{ background: statusBg, borderColor: statusColor+"33", color: "#0C1A2E" }}>
                <span className="text-[11px]">{statusIcon}</span>
                <span className="font-semibold">{e.childName}</span>
                {age && <span style={{ color: "#64748b", fontSize: 10 }}>{age}</span>}
                <span style={{ color: statusColor, fontSize: 10 }}>{statusLabel}</span>
              </span>;
            })}</div>}
          </div>
        </Card>);})}</div>}
    </>
  );
}
