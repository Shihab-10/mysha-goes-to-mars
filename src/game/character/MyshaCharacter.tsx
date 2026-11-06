
import { useEffect, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three";

type MyshaCharacterProps = {
  moving?: boolean;
  running?: boolean;
};

const MODEL_PATH =
  "/models/characters/Meshy_AI_Animation_Walking_withSkin.fbx";

const TEXTURE_PATH =
  "/textures/characters/texture_0.png";

export function MyshaCharacter({
  moving = false,
  running = false,
}: MyshaCharacterProps) {
  const source = useLoader(FBXLoader, MODEL_PATH);
  const texture = useLoader(THREE.TextureLoader, TEXTURE_PATH);

  const model = useMemo(() => {
    const character = cloneSkeleton(source);

    texture.colorSpace = THREE.SRGBColorSpace;

    character.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.castShadow = true;
      object.receiveShadow = true;

      const prepareMaterial = (original: THREE.Material) => {
        const material = original.clone();

        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhongMaterial ||
          material instanceof THREE.MeshLambertMaterial ||
          material instanceof THREE.MeshBasicMaterial
        ) {
          if (!material.map) {
            material.map = texture;
            material.color.set("#ffffff");
          }

          material.needsUpdate = true;
        }

        return material;
      };

      if (Array.isArray(object.material)) {
        object.material = object.material.map(prepareMaterial);
      } else {
        object.material = prepareMaterial(object.material);
      }
    });

    const bounds = new THREE.Box3().setFromObject(character);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());

    const scale = size.y > 0 ? 1.75 / size.y : 1;

    character.scale.setScalar(scale);

    character.position.set(
      -center.x * scale,
      -bounds.min.y * scale,
      -center.z * scale
    );

    return character;
  }, [source, texture]);

  const mixer = useMemo(
    () => new THREE.AnimationMixer(model),
    [model]
  );

  const walkingClip = useMemo(() => {
    return (
      source.animations.find((clip) =>
        /walk/i.test(clip.name)
      ) ?? source.animations[0]
    );
  }, [source]);

  useEffect(() => {
    if (!walkingClip) return;

    const action = mixer.clipAction(walkingClip);

    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();

    return () => {
      action.stop();
      mixer.uncacheAction(walkingClip);
    };
  }, [mixer, walkingClip]);

  useEffect(() => {
    if (!walkingClip) return;

    const action = mixer.clipAction(walkingClip);

    action.paused = !moving;
    action.timeScale = running ? 1.5 : 1;
  }, [mixer, walkingClip, moving, running]);

  useFrame((_, delta) => {
    mixer.update(Math.min(delta, 0.05));
  });

  return <primitive object={model} />;
}
