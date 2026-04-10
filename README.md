# 🐴 Centre Équestre d'Agon-Coutainville

Site vitrine + réservation en ligne + gestion complète

## Stack technique

- **Frontend** : Next.js 15 + React 19 + TypeScript + Tailwind CSS 4
- **Backend** : Firebase (Auth + Firestore + Storage)
- **Paiements** : CAWL — Crédit Agricole Worldline (Hosted Checkout Page)
- **Emails** : Resend
- **Hébergement** : Vercel
- **Icônes** : Lucide React

## Setup rapide

### 1. Cloner et installer

```bash
git clone https://github.com/TON_USERNAME/centre-equestre-agon.git
cd centre-equestre-agon
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.local.example .env.local
```

Puis remplir les valeurs dans `.env.local` :

#### Firebase
1. Va sur https://console.firebase.google.com/
2. Crée un projet "centre-equestre-agon"
3. Active **Authentication** → Méthodes : Google + Facebook
4. Active **Firestore Database** (mode test)
5. Active **Storage**
6. Va dans ⚙️ Paramètres → Général → "Vos applications" → Ajouter une app Web
7. Copie les clés dans `.env.local`

#### CAWL (Crédit Agricole Worldline)
1. Accès fourni par le Crédit Agricole
2. Copie CAWL_PSPID, CAWL_API_KEY_ID, CAWL_SECRET_API_KEY dans `.env.local`
3. Configure le webhook vers `/api/cawl/webhook`

#### Resend
1. Va sur https://resend.com/
2. Crée un compte (gratuit jusqu'à 3000 emails/mois)
3. Copie la clé API dans `.env.local`

### 3. Lancer en local

```bash
npm run dev
```

→ Ouvre http://localhost:3000

### 4. Déployer sur Vercel

1. Va sur https://vercel.com/
2. Connecte-toi avec ton compte GitHub
3. Importe le repository "centre-equestre-agon"
4. Ajoute les variables d'environnement (copie de `.env.local`)
5. Déploie !

→ Ton site sera en ligne sur `centre-equestre-agon.vercel.app`

Pour configurer le domaine `app.centreequestreagon.com` :
- Dans Vercel → Settings → Domains → Ajouter `app.centreequestreagon.com`
- Chez ton registrar (OVH/Orange) : ajoute un CNAME `app` → `cname.vercel-dns.com`

## Structure du projet

```
src/
├── app/                    # Pages (Next.js App Router)
│   ├── page.tsx           # Homepage
│   ├── layout.tsx         # Layout racine (fonts, meta)
│   ├── globals.css        # Tailwind + design tokens
│   ├── activites/         # Page activités
│   ├── mini-ferme/        # Page mini-ferme
│   ├── galerie/           # Galerie photos
│   ├── tarifs/            # Grille tarifaire
│   ├── contact/           # Contact + formulaire
│   ├── espace-cavalier/   # Espace famille connecté
│   │   ├── dashboard/
│   │   ├── reserver/
│   │   ├── reservations/
│   │   ├── factures/
│   │   ├── profil/
│   │   └── satisfaction/
│   └── admin/             # Back-office admin
│       ├── dashboard/
│       ├── activites/
│       ├── planning/
│       ├── cavaliers/
│       ├── paiements/
│       ├── comptabilite/
│       ├── communication/
│       ├── galerie/
│       └── parametres/
├── components/
│   ├── ui/                # Composants réutilisables (Button, Card, Badge...)
│   ├── layout/            # Navbar, Footer, Sidebar
│   └── sections/          # Sections de page (Hero, Activities...)
├── lib/
│   ├── firebase.ts        # Config Firebase
│   └── config.ts          # Constantes du site
├── types/
│   └── index.ts           # Types TypeScript (Firestore)
└── styles/                # Styles additionnels
```

## Phases de développement

| Phase | Contenu | Statut |
|-------|---------|--------|
| 1 | Site vitrine (8 pages) | 🚧 En cours |
| 2 | Auth + profils famille | ⏳ |
| 3A | Réservation + paiement CAWL | ✅ |
| 3B | Rapprochement bancaire CSV Crédit Agricole | ✅ |
| 4 | Communication & fidélisation | ⏳ |
| 5 | Polish & migration domaine | ⏳ |

## Couleurs du logo

- **Bleu royal** : `#2050A0` (hippocampe + texte)
- **Or/Ambre** : `#F0A010` (étoile + accents)
- **Bleu nuit** : `#0C1A2E` (fond)
