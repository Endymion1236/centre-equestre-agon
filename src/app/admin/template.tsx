"use client";

import { usePathname } from "next/navigation";
import AdminContextBar from "@/components/admin/AdminContextBar";
import AdminDenseModulePolish from "@/components/admin/AdminDenseModulePolish";
import AdminModuleSpotlight from "@/components/admin/AdminModuleSpotlight";
import AdminUxPolish from "@/components/admin/AdminUxPolish";

function getAdminSection(pathname: string) {
  const section = pathname.split("/").filter(Boolean)[1];
  return section || "dashboard";
}

export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      data-admin-page
      data-admin-section={getAdminSection(pathname)}
      className="admin-page-shell"
    >
      <AdminUxPolish />
      <AdminDenseModulePolish />
      <AdminContextBar />
      <AdminModuleSpotlight />
      {children}
    </div>
  );
}
