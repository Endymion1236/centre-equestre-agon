import Link from "next/link";

export default function MerciBonPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-blue-900/5 p-8 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="font-serif text-2xl font-bold text-blue-900 mb-3">Merci pour votre achat !</h1>
        <p className="font-body text-sm text-slate-600 mb-2">
          Votre paiement a bien été reçu. Votre <strong>bon cadeau et son code</strong> vous ont été
          envoyés par email.
        </p>
        <p className="font-body text-xs text-slate-400 mb-6">
          Pensez à vérifier vos spams si vous ne le voyez pas dans quelques minutes.
        </p>
        <Link href="/accueil"
          className="inline-block px-6 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 no-underline hover:bg-blue-600">
          Retour au site
        </Link>
      </div>
    </main>
  );
}
