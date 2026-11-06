
import { Html } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";

export type Equipment = {
  id: string;
  name: string;
  position: [number, number, number];
  color: string;
};

export function EquipmentPickup({
  equipment,
}: {
  equipment: Equipment;
}) {
  return (
    <group position={equipment.position}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
          <boxGeometry args={[0.75, 1, 0.75]} />
          <meshStandardMaterial
            color={equipment.color}
            emissive={equipment.color}
            emissiveIntensity={0.25}
          />
        </mesh>
      </RigidBody>

      <Html position={[0, 1.5, 0]} center>
        <div
          style={{
            background: "#071525ee",
            color: "white",
            padding: "8px 12px",
            borderRadius: 7,
            whiteSpace: "nowrap",
            fontSize: 12,
            fontWeight: "bold",
            border: "1px solid #51718a",
            pointerEvents: "none",
          }}
        >
          {equipment.name}
        </div>
      </Html>
    </group>
  );
}
