import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface OnboardingContextType {
  showTutorial: boolean;
  startTutorial: () => void;
  completeTutorial: () => void;
  isTutorialCompleted: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [showTutorial, setShowTutorial] = useState(false);
  const [isTutorialCompleted, setIsTutorialCompleted] = useState(false);

  // Check if tutorial has been completed on component mount
  useEffect(() => {
    const tutorialCompleted = localStorage.getItem("tutorial_completed") === "true";
    setIsTutorialCompleted(tutorialCompleted);

    // If user is new (no tutorial_completed in localStorage), show the tutorial
    const isFirstVisit = localStorage.getItem("tutorial_completed") === null;
    if (isFirstVisit) {
      setShowTutorial(true);
    }
  }, []);

  // Start the tutorial
  const startTutorial = () => {
    setShowTutorial(true);
  };

  // Complete the tutorial
  const completeTutorial = () => {
    setShowTutorial(false);
    setIsTutorialCompleted(true);
    localStorage.setItem("tutorial_completed", "true");
  };

  return (
    <OnboardingContext.Provider
      value={{
        showTutorial,
        startTutorial,
        completeTutorial,
        isTutorialCompleted,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}