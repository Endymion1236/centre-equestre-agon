import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PUBLIC_ACTIVITIES, getPublicActivity } from "@/lib/public-activities";
import ActivityDetailClient from "./ActivityDetailClient";

type ActivityPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return PUBLIC_ACTIVITIES.map((activity) => ({ slug: activity.id }));
}

export async function generateMetadata({ params }: ActivityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const activity = getPublicActivity(slug);
  if (!activity) return { title: "Activité introuvable" };

  return {
    title: activity.title,
    description: activity.description,
    alternates: { canonical: `/activites/${activity.id}` },
    openGraph: {
      title: `${activity.title} | Centre Équestre d’Agon-Coutainville`,
      description: activity.description,
      type: "website",
      images: ["/images/hero-equestre.png"],
    },
  };
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { slug } = await params;
  const activity = getPublicActivity(slug);
  if (!activity) notFound();

  return (
    <>
      <Navbar />
      <ActivityDetailClient activity={activity} />
      <Footer />
    </>
  );
}
