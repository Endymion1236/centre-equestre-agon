"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PaniersPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/paiements"); }, [router]);
  return <div className="p-8 text-center font-body text-sm text-gray-400">Redirection vers Paiements...</div>;
}
