#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# 🧪 Script de test E2E — Centre Équestre d'Agon-Coutainville
# ═══════════════════════════════════════════════════════════════════════
#
# Usage :
#   ./scripts/run-tests.sh              → lance TOUS les tests
#   ./scripts/run-tests.sh securite     → tests de sécurité uniquement
#   ./scripts/run-tests.sh admin        → tests admin (nécessite auth)
#   ./scripts/run-tests.sh flows        → tests de flux fonctionnels
#   ./scripts/run-tests.sh api          → tests API auth uniquement
#   ./scripts/run-tests.sh smoke        → smoke test navigation
#   ./scripts/run-tests.sh cavalier     → tests espace cavalier
#   ./scripts/run-tests.sh rapport      → tous les tests + rapport HTML
#
# Prérequis :
#   1. npm install (avec Playwright installé)
#   2. L'app doit tourner (npm run dev) OU définir PLAYWRIGHT_BASE_URL
#   3. Pour les tests admin : définir TEST_ADMIN_EMAIL et TEST_ADMIN_TOKEN
#
# Variables d'environnement :
#   PLAYWRIGHT_BASE_URL  → URL de l'app (défaut: http://localhost:3000)
#   TEST_ADMIN_EMAIL     → Email du compte admin Firebase
#   TEST_ADMIN_TOKEN     → Token Firebase ID du compte admin
#                           (obtenu via : await user.getIdToken() dans la console navigateur)
#
# Pour obtenir le TEST_ADMIN_TOKEN :
#   1. Connecte-toi en admin sur l'app
#   2. Ouvre la console navigateur (F12)
#   3. Tape : await firebase.auth().currentUser.getIdToken()
#   4. Copie le token retourné
#
# ═══════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  🧪 Tests E2E — Centre Équestre d'Agon-Coutainville${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

# ── Vérifier que Playwright est installé ───────────────────────────────
if ! npx playwright --version &>/dev/null; then
  echo -e "${YELLOW}⚠️  Playwright non installé. Installation...${NC}"
  npx playwright install chromium --with-deps
fi

# ── Vérifier les variables d'environnement ─────────────────────────────
BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
echo -e "\n  📍 URL cible : ${BOLD}$BASE_URL${NC}"

if [ -n "$TEST_ADMIN_EMAIL" ]; then
  echo -e "  👤 Admin    : ${GREEN}$TEST_ADMIN_EMAIL${NC}"
else
  echo -e "  👤 Admin    : ${YELLOW}Non défini (tests admin limités)${NC}"
fi

if [ -n "$TEST_ADMIN_TOKEN" ]; then
  echo -e "  🔑 Token    : ${GREEN}Défini (${#TEST_ADMIN_TOKEN} chars)${NC}"
else
  echo -e "  🔑 Token    : ${YELLOW}Non défini${NC}"
fi

# ── Vérifier que le serveur tourne ─────────────────────────────────────
echo -e "\n  🔍 Vérification du serveur..."
if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" | grep -q "200\|302\|301"; then
  echo -e "  ${GREEN}✅ Serveur accessible${NC}"
else
  echo -e "  ${RED}❌ Serveur non accessible à $BASE_URL${NC}"
  echo -e "  ${YELLOW}→ Lance 'npm run dev' dans un autre terminal${NC}"
  echo -e "  ${YELLOW}→ Ou définis PLAYWRIGHT_BASE_URL=https://centre-equestre-agon.vercel.app${NC}"
  exit 1
fi

echo ""

# ── Déterminer quels tests lancer ──────────────────────────────────────
MODE="${1:-all}"

case "$MODE" in
  securite|security|sec)
    echo -e "${BOLD}  Mode : Tests de sécurité${NC}\n"
    npx playwright test tests/e2e/public/15-securite.spec.ts tests/e2e/public/24-securite-hardening.spec.ts --project=public
    ;;

  api|auth)
    echo -e "${BOLD}  Mode : Tests API auth${NC}\n"
    npx playwright test tests/e2e/admin/21-api-auth.spec.ts --project=public
    ;;

  admin)
    echo -e "${BOLD}  Mode : Tests admin complets${NC}\n"
    npx playwright test --project=setup --project=admin
    ;;

  flows|flux)
    echo -e "${BOLD}  Mode : Flux fonctionnels${NC}\n"
    npx playwright test tests/e2e/admin/22-flows-complets.spec.ts --project=setup --project=admin
    ;;

  smoke)
    echo -e "${BOLD}  Mode : Smoke test navigation${NC}\n"
    npx playwright test tests/e2e/admin/09-navigation-smoke.spec.ts --project=setup --project=admin
    ;;

  cavalier|famille)
    echo -e "${BOLD}  Mode : Espace cavalier${NC}\n"
    npx playwright test tests/e2e/admin/23-espace-cavalier-auth.spec.ts tests/e2e/public/18-espace-cavalier-flows.spec.ts --project=setup --project=admin --project=public
    ;;

  rapport|report)
    echo -e "${BOLD}  Mode : Tous les tests + rapport HTML${NC}\n"
    npx playwright test --reporter=html
    echo -e "\n${GREEN}📊 Rapport : npx playwright show-report${NC}"
    ;;

  all|tout)
    echo -e "${BOLD}  Mode : Tous les tests${NC}\n"
    npx playwright test
    ;;

  *)
    echo -e "${RED}Mode inconnu : $MODE${NC}"
    echo -e "\nModes disponibles :"
    echo "  securite  — Tests de sécurité uniquement"
    echo "  api       — Tests API auth (401 sans token)"
    echo "  admin     — Tests admin complets (nécessite auth)"
    echo "  flows     — Flux fonctionnels complets"
    echo "  smoke     — Smoke test navigation"
    echo "  cavalier  — Espace cavalier"
    echo "  rapport   — Tous + rapport HTML"
    echo "  all       — Tout (défaut)"
    exit 1
    ;;
esac

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✅ Tests terminés${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
