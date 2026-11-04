"use client";
/**
 * Visage 3D de la borne : le personnage /borne/calin.glb, animé selon l'état
 * de la conversation, la bouche ouverte au rythme réel de la voix.
 *
 * Le fichier est fabriqué dans Blender (contrat : docs/BORNE-PERSONNAGE-3D.md,
 * règles : lib/borne-3d). Tant qu'il n'est pas déposé dans public/borne/, ce
 * composant signale son absence aussitôt (onErreur) et la borne garde son
 * visage actuel : rien ne casse en attendant. three.js n'est téléchargé que
 * si le fichier existe.
 *
 * Même interface que les autres visages (BorneVisageHandle) : la page pousse
 * l'ouverture de bouche à ~60 fps par setBouche(0..1), jamais par un rendu
 * React.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { animationExpression, animationPourEtat, indiceBouche, ouverture, type EtatBorne3D } from "@/lib/borne-3d";

export const SRC_3D = "/borne/calin.glb";
const FONDU = 0.35; // secondes de fondu entre deux animations

/** Ce que le fichier contient, pour la page d'essai (/borne/apercu-3d). */
export interface Infos3D {
  animations: string[];
  bouche: boolean;
  triangles: number;
  octets: number | null;
  camera: boolean;
}

export interface Visage3DHandle {
  setBouche: (v: number) => void;
  setHumeur?: (pose: "clin" | "desole" | "joie" | "rire" | "etonne", dureeMs?: number) => void;
}

const BorneVisage3D = forwardRef<Visage3DHandle, { etat: EtatBorne3D; onErreur: () => void; src?: string; onInfos?: (i: Infos3D) => void }>(
  function BorneVisage3D({ etat, onErreur, src = SRC_3D, onInfos }, ref) {
    const hoteRef = useRef<HTMLDivElement | null>(null);
    const etatRef = useRef(etat);
    // Ce que l'animation lit à chaque image, sans rendu React.
    const boucheRef = useRef(0);
    const pilote = useRef<{ jouer: (etat: EtatBorne3D) => void; expression: (pose: string) => void } | null>(null);

    useImperativeHandle(ref, () => ({
      setBouche: (v: number) => { boucheRef.current = ouverture(v); },
      setHumeur: (pose) => { pilote.current?.expression(pose); },
    }), []);

    useEffect(() => {
      etatRef.current = etat;
      pilote.current?.jouer(etat);
    }, [etat]);

    useEffect(() => {
      let arrete = false;
      let nettoyer: (() => void) | null = null;

      (async () => {
        // Le fichier est-il là ? Sinon, inutile de télécharger three.js.
        let octets: number | null = null;
        try {
          const r = await fetch(src, { method: "HEAD", cache: "no-cache" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          octets = Number(r.headers.get("content-length")) || null;
        } catch { if (!arrete) onErreur(); return; }

        try {
          const THREE = await import("three");
          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
          if (arrete || !hoteRef.current) return;
          const hote = hoteRef.current;

          const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
          rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          rendu.outputColorSpace = THREE.SRGBColorSpace;
          hote.appendChild(rendu.domElement);
          rendu.domElement.style.width = "100%";
          rendu.domElement.style.height = "100%";

          const scene = new THREE.Scene();
          scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.4));
          const soleil = new THREE.DirectionalLight(0xffffff, 1.6);
          soleil.position.set(1.5, 3, 2.5);
          scene.add(soleil);

          const gltf = await new GLTFLoader().loadAsync(src);
          if (arrete) { rendu.dispose(); return; }
          scene.add(gltf.scene);

          // Caméra du fichier si elle existe (« Camera » dans Blender), sinon
          // cadrage automatique sur le personnage, de face.
          let camera: InstanceType<typeof THREE.PerspectiveCamera>;
          const camFichier = gltf.cameras.find((c) => (c as any).isPerspectiveCamera) as any;
          if (camFichier) {
            camera = camFichier;
          } else {
            camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
            const boite = new THREE.Box3().setFromObject(gltf.scene);
            const centre = boite.getCenter(new THREE.Vector3());
            const taille = boite.getSize(new THREE.Vector3());
            const distance = (Math.max(taille.y, taille.x) / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.15;
            camera.position.set(centre.x, centre.y + taille.y * 0.05, centre.z + distance + taille.z / 2);
            camera.lookAt(centre);
          }

          // Formes de bouche de tous les maillages qui en ont une.
          const bouches: { influences: number[]; indice: number }[] = [];
          gltf.scene.traverse((o: any) => {
            if (o.isMesh && o.morphTargetInfluences) {
              const indice = indiceBouche(o.morphTargetDictionary);
              if (indice >= 0) bouches.push({ influences: o.morphTargetInfluences, indice });
            }
          });

          const mixeur = new THREE.AnimationMixer(gltf.scene);
          const noms = gltf.animations.map((a) => a.name);
          const actions = new Map(gltf.animations.map((a) => [a.name, mixeur.clipAction(a)]));
          let courante: any = null;
          const jouer = (e: EtatBorne3D) => {
            const nom = animationPourEtat(e, noms);
            const action = nom ? actions.get(nom) : null;
            if (!action || action === courante) return;
            action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(FONDU).play();
            courante?.fadeOut(FONDU);
            courante = action;
          };
          const expression = (pose: string) => {
            const nom = animationExpression(pose, noms);
            const action = nom ? actions.get(nom) : null;
            if (!action) return;
            action.reset().setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = false;
            action.fadeIn(0.2).play();
            courante?.fadeOut(0.2);
            const fin = () => {
              mixeur.removeEventListener("finished", fin);
              courante = null;
              jouer(etatRef.current);
              action.fadeOut(FONDU);
            };
            mixeur.addEventListener("finished", fin);
          };
          pilote.current = { jouer, expression };
          jouer(etatRef.current);
          let triangles = 0;
          gltf.scene.traverse((o: any) => {
            if (o.isMesh && o.geometry) triangles += Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3);
          });
          onInfos?.({ animations: noms, bouche: bouches.length > 0, triangles, octets, camera: !!camFichier });

          const ajuster = () => {
            const l = hote.clientWidth || 1, h = hote.clientHeight || 1;
            rendu.setSize(l, h, false);
            camera.aspect = l / h;
            camera.updateProjectionMatrix();
          };
          ajuster();
          const observateur = new ResizeObserver(ajuster);
          observateur.observe(hote);

          const horloge = new THREE.Clock();
          let lisse = 0;
          rendu.setAnimationLoop(() => {
            mixeur.update(Math.min(horloge.getDelta(), 0.1));
            // Bouche : attaque rapide, retombée plus douce, comme les autres visages.
            const cible = etatRef.current === "speaking" ? boucheRef.current : 0;
            lisse += (cible - lisse) * (cible > lisse ? 0.6 : 0.25);
            for (const b of bouches) b.influences[b.indice] = lisse;
            rendu.render(scene, camera);
          });

          nettoyer = () => {
            rendu.setAnimationLoop(null);
            observateur.disconnect();
            mixeur.stopAllAction();
            gltf.scene.traverse((o: any) => {
              o.geometry?.dispose?.();
              const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
              for (const m of mats) { for (const v of Object.values(m)) (v as any)?.isTexture && (v as any).dispose(); m.dispose?.(); }
            });
            rendu.dispose();
            rendu.domElement.remove();
          };
          if (arrete) nettoyer();
        } catch (e) {
          console.warn("[borne 3D] personnage illisible, visage de secours :", e);
          if (!arrete) onErreur();
        }
      })();

      return () => { arrete = true; pilote.current = null; nettoyer?.(); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    return <div ref={hoteRef} className="w-full h-full" aria-label="Câlin, le poney de l'accueil" role="img" />;
  },
);

export default BorneVisage3D;
