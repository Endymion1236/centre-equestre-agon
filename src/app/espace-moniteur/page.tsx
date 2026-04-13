"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EspaceMoniteurPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/espace-moniteur/planning"); }, []);
  return null;
}
