"use client";

import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { Send, Mail, Users, Star, Zap, Loader2, Plus, Clock } from "lucide-react";
import type { Family } from "@/types";

const campaigns = [
  { name: "Relance rentrée", trigger: "J-30 avant septembre", audience: "Familles année précédente non réinscrites", status: "active", icon: "📅" },
  { name: "Relance vacances", trigger: "J-21 avant chaque vacance", audience: "Familles avec enfants du bon âge", status: "active", icon: "🏖️" },
  { name: "Relance inactifs", trigger: "Après 3 mois sans réservation", audience: "Familles inactives", status: "active", icon: "💤" },
  { name: "Anniversaire enfant", trigger: "J-14 avant anniversaire", audience: "Parent de l'enfant", status: "pause", icon: "🎂" },
  { name: "Satisfaction post-stage", trigger: "J+1 après fin de stage", audience: "Famille du cavalier", status: "active", icon: "⭐" },
];

export default function CommunicationPage() {
  const [tab, setTab] = useState<"newsletter" | "campagnes" | "audiences">("newsletter");
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAudience, setSelectedAudience] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getDocs(collection(db, "families")).then((snap) => {
      setFamilies(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Family[]);
      setLoading(false);
    });
  }, []);

  const totalFamilies = families.length;
  const allChildren = families.flatMap((f) => f.children || []);

  const audiences = [
    { id: "all", label: "Toutes les familles", count: totalFamilies },
    { id: "with-children", label: "Familles avec cavaliers", count: families.filter((f) => (f.children || []).length > 0).length },
    { id: "no-children", label: "Profils incomplets", count: families.filter((f) => (f.children || []).length === 0).length },
  ];

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Communication</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([["newsletter", "Newsletter", Mail], ["campagnes", "Campagnes auto", Zap], ["audiences", "Audiences", Users]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-blue-200"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* ─── Newsletter Tab ─── */}
      {tab === "newsletter" && (
        <div>
          {sent ? (
            <Card padding="lg" className="text-center">
              <span className="text-5xl block mb-4">✅</span>
              <h2 className="font-display text-xl font-bold text-blue-800 mb-2">Email programmé !</h2>
              <p className="font-body text-sm text-gray-500 mb-4">
                L&apos;email sera envoyé à {audiences.find((a) => a.id === selectedAudience)?.count || 0} famille(s).
              </p>
              <button onClick={() => setSent(false)} className="font-body text-sm font-semibold text-blue-500 bg-transparent border-none cursor-pointer underline">
                Créer un autre email
              </button>
            </Card>
          ) : (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Créer un email</h2>
              <div className="flex flex-col gap-4">
                {/* Audience */}
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Destinataires</label>
                  <div className="flex flex-col gap-2">
                    {audiences.map((a) => (
                      <label key={a.id} onClick={() => setSelectedAudience(a.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-all
                          ${selectedAudience === a.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedAudience === a.id ? "border-blue-500" : "border-gray-300"}`}>
                            {selectedAudience === a.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                          </div>
                          <span className="font-body text-sm font-medium text-blue-800">{a.label}</span>
                        </div>
                        <Badge color="blue">{a.count} familles</Badge>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Objet</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: Les stages de Pâques arrivent !" className={inputCls} />
                </div>

                {/* Body */}
                <div>
                  <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Message</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Bonjour [prenom_parent],&#10;&#10;Écrivez votre message ici..." className={`${inputCls} resize-y`} />
                </div>

                {/* Variables */}
                <div>
                  <div className="font-body text-xs font-semibold text-gray-400 mb-2">Variables disponibles (cliquez pour insérer) :</div>
                  <div className="flex flex-wrap gap-2">
                    {["[prenom_parent]", "[nom_famille]", "[prenom_enfant]", "[lien_reservation]"].map((v) => (
                      <button key={v} onClick={() => setBody((b) => b + v)}
                        className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg cursor-pointer border-none hover:bg-blue-100 transition-colors">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Send */}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setSent(true)} disabled={!selectedAudience || !subject}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer
                      ${!selectedAudience || !subject ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
                    <Send size={16} /> Envoyer maintenant
                  </button>
                  <button className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-medium text-gray-500 bg-white border border-gray-200 cursor-pointer">
                    <Clock size={16} /> Programmer
                  </button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ─── Campagnes auto Tab ─── */}
      {tab === "campagnes" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="font-body text-sm text-gray-500">Emails envoyés automatiquement quand les conditions sont remplies.</p>
            <button className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2 rounded-lg border-none cursor-pointer">
              <Plus size={16} /> Nouvelle campagne
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {campaigns.map((c, i) => (
              <Card key={i} padding="md">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${c.status === "active" ? "bg-green-500 shadow-[0_0_6px_rgba(39,174,96,0.4)]" : "bg-orange-400"}`} />
                    <div>
                      <div className="font-body text-base font-semibold text-blue-800">
                        <span className="mr-2">{c.icon}</span>{c.name}
                      </div>
                      <div className="font-body text-xs text-gray-400">{c.trigger}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={c.status === "active" ? "green" : "orange"}>{c.status === "active" ? "Active" : "En pause"}</Badge>
                    <button className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer">Modifier</button>
                  </div>
                </div>
                <div className="mt-2 font-body text-xs text-gray-400">Audience : {c.audience}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Audiences Tab ─── */}
      {tab === "audiences" && (
        <div>
          {loading ? (
            <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {audiences.map((a) => (
                <Card key={a.id} padding="md" hover>
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-body text-base font-semibold text-blue-800">{a.label}</div>
                    <span className="font-body text-2xl font-bold text-blue-500">{a.count}</span>
                  </div>
                  <Badge color="green">Auto</Badge>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
