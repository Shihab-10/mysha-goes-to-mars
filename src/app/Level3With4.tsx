
import { useCallback, useState } from "react";
import { Level3Landing } from "./Level3Landing";
import { Level4Mars } from "./Level4Mars";

type Screen = "level3" | "level4";

type Level3With4Props = {
  onBackToLevel2?: () => void;
};

export function Level3With4({
  onBackToLevel2,
}: Level3With4Props = {}) {
  const [screen, setScreen] = useState<Screen>("level3");

  const continueAfterLanding = useCallback(() => {
    setScreen((current) => {
      if (current !== "level3") {
        return current;
      }

      return "level4";
    });
  }, []);

  if (screen === "level3") {
    return (
      <Level3Landing
        onBackToLevel2={onBackToLevel2}
        onLevel4={continueAfterLanding}
      />
    );
  }

  return <Level4Mars />;
}

export default Level3With4;
