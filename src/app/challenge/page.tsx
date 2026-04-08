import { Suspense } from "react";
import ChallengeClientPage from "./ChallengeClient";

export default function ChallengePage() {
  return <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#5B7C5E"}}>⏳ Chargement...</div>}><ChallengeClientPage /></Suspense>;
}
