/**
 * Hook useAgentContext
 * Permet à chaque module d'enrichir le contexte de l'agent IA vocal
 * avec ses propres données.
 *
 * Usage :
 *   const { setAgentContext } = useAgentContext("planning");
 *   setAgentContext({ creneaux_aujourd_hui: [...], inscrits: 12 });
 */

import { useEffect, useCallback } from "react";

export function useAgentContext(moduleName: string) {
  const setAgentContext = useCallback((data: Record<string, any>) => {
    window.dispatchEvent(new CustomEvent("agent:setContext", {
      detail: {
        module_actif: moduleName,
        ...data,
      },
    }));
  }, [moduleName]);

  // Nettoyer le contexte module quand on quitte la page
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("agent:setContext", {
        detail: { module_actif: null },
      }));
    };
  }, []);

  return { setAgentContext };
}
