"use client";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { Heart, Loader2 } from "lucide-react";

interface Animal {
  name: string;
  type: string;
  color: string;
  description: string;
  photo: string;
}

const defaultAnimals: Animal[] = [
  { name: "Pépita", type: "Cochon Kune Kune", color: "Roux", description: "Notre petite cochonne adorable au caractère doux. Les enfants l'adorent !", photo: "" },
  { name: "Ronron", type: "Cochon Kune Kune", color: "Blanc", description: "Le compagnon de Pépita, aussi calme que son nom l'indique.", photo: "" },
  { name: "Les chèvres", type: "Chèvres naines", color: "", description: "Nos chèvres sont de vraies acrobates ! Toujours curieuses.", photo: "" },
  { name: "Les poules", type: "Poules pondeuses", color: "", description: "Nos poules se promènent librement. Les enfants peuvent ramasser les œufs !", photo: "" },
];

const gradients = [
  "from-pink-300 to-pink-200",
  "from-gray-200 to-gray-100",
  "from-amber-200 to-amber-100",
  "from-orange-200 to-orange-100",
  "from-green-200 to-green-100",
  "from-blue-200 to-blue-100",
];

export default function MiniFermeAnimals() {
  const [animals, setAnimals] = useState<Animal[]>(defaultAnimals);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "settings", "miniferme")).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data.animals && data.animals.length > 0) {
          setAnimals(data.animals);
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-300 mx-auto" /></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {animals.map((animal, i) => (
        <Card key={i} hover className="!p-0 overflow-hidden">
          {animal.photo ? (
            <div className="h-56 overflow-hidden rounded-t-xl">
              <img
                src={animal.photo}
                alt={animal.name}
                className="w-full h-full object-cover object-center"
              />
            </div>
          ) : (
            <div className={`h-40 bg-gradient-to-br ${gradients[i % gradients.length]} flex items-center justify-center`}>
              <Heart size={32} className="text-pink-400 opacity-50" />
            </div>
          )}
          <div className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-display text-lg font-bold text-blue-800">
                {animal.name}
              </h3>
              <span className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-2.5 py-0.5 rounded-full">
                {animal.type}
              </span>
            </div>
            {animal.color && (
              <div className="font-body text-xs text-gray-400 mb-2">
                Couleur : {animal.color}
              </div>
            )}
            <p className="font-body text-sm text-gray-500 leading-relaxed">
              {animal.description}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
