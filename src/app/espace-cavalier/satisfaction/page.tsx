"use client";
import { Card } from "@/components/ui";

export default function SatisfactionPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Satisfaction</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Donnez votre avis sur vos activités au centre équestre.</p>

      <Card padding="lg" className="text-center">
        <span className="text-5xl block mb-4">⭐</span>
        <h2 className="font-display text-lg font-bold text-blue-800 mb-2">Donnez votre avis !</h2>
        <p className="font-body text-sm text-gray-500 mb-4">
          Après chaque activité, vous recevrez un email vous invitant à noter votre expérience.
          Vos avis nous aident à nous améliorer !
        </p>
        <p className="font-body text-xs text-gray-600">
          Les enquêtes de satisfaction seront envoyées automatiquement après vos prochaines activités.
        </p>
      </Card>
    </div>
  );
}
