"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="card p-10 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h3 className="font-display text-xl font-bold text-blue-800 mb-2">
          Message envoyé !
        </h3>
        <p className="font-body text-sm text-gray-500 mb-6">
          Nous vous répondrons dans les meilleurs délais.
        </p>
        <button
          onClick={() => setSent(false)}
          className="font-body text-sm font-semibold text-blue-500 bg-transparent border-none cursor-pointer underline"
        >
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h3 className="font-display text-xl font-bold text-blue-800 mb-1">
        Envoyez-nous un message
      </h3>
      <p className="font-body text-sm text-gray-400 mb-6">
        Nous vous répondons sous 24h.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          {["Nom", "Prénom"].map((label) => (
            <div key={label} className="flex-1">
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">
                {label} *
              </label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none transition-colors"
                placeholder={label}
              />
            </div>
          ))}
        </div>

        {["Email *", "Téléphone"].map((label) => (
          <div key={label}>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">
              {label}
            </label>
            <input
              className="w-full px-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none transition-colors"
              placeholder={label.replace(" *", "")}
              type={label.includes("Email") ? "email" : "tel"}
            />
          </div>
        ))}

        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">
            Sujet
          </label>
          <select className="w-full px-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-cream text-blue-800 cursor-pointer focus:border-blue-500 focus:outline-none">
            <option>Renseignement général</option>
            <option>Réservation stage</option>
            <option>Réservation balade</option>
            <option>Anniversaire</option>
            <option>Cours réguliers / Forfait</option>
            <option>Compétition</option>
            <option>Autre</option>
          </select>
        </div>

        <div>
          <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">
            Message *
          </label>
          <textarea
            rows={5}
            className="w-full px-4 py-3 rounded-xl border border-blue-500/8 font-body text-sm bg-cream resize-y focus:border-blue-500 focus:outline-none transition-colors"
            placeholder="Votre message..."
          />
        </div>

        <Button
          variant="primary"
          full
          onClick={() => setSent(true)}
        >
          Envoyer le message
        </Button>
      </div>
    </div>
  );
}
