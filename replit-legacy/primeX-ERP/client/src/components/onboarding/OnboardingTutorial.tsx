import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Define the tutorial steps
export const tutorialSteps = [
  {
    id: "welcome",
    title: "Welcome to PrimeX",
    description: "Let's take a quick tour of your new ERP system to help you get started.",
    target: "body",
    position: "center",
    route: "/", // Dashboard route
    showSkip: true,
    showNext: true,
    showBack: false,
  },
  {
    id: "dashboard-overview",
    title: "Your Dashboard",
    description: "This is your main dashboard where you can monitor key metrics and get real-time insights about your business.",
    target: ".dashboard-header",
    position: "bottom",
    route: "/",
    showSkip: true,
    showNext: true,
    showBack: true,
  },
  {
    id: "kpi-cards",
    title: "Key Performance Indicators",
    description: "These cards show your most important metrics. Hover over any card to see details and click to view more information.",
    target: ".kpi-cards",
    position: "bottom",
    route: "/",
    showSkip: true,
    showNext: true,
    showBack: true,
  },
  {
    id: "ai-insights",
    title: "AI-Powered Insights",
    description: "PrimeX uses AI to analyze your data and provide actionable insights to improve your operations.",
    target: ".insights-section",
    position: "right",
    route: "/",
    showSkip: true,
    showNext: true,
    showBack: true,
  },
  {
    id: "navigation",
    title: "Main Navigation",
    description: "Use the sidebar to navigate between different modules of the system.",
    target: "#sidebar",
    position: "right",
    route: "/",
    showSkip: true,
    showNext: true,
    showBack: true,
  },
  {
    id: "calendar-intro",
    title: "Calendar & Scheduling",
    description: "Our integrated calendar helps you manage events, meetings, and deadlines with AI-assisted scheduling suggestions.",
    target: ".nav-item[href='/calendar']",
    position: "right",
    route: "/",
    showSkip: true,
    showNext: true,
    showBack: true,
    onClick: () => document.querySelector(".nav-item[href='/calendar']")?.parentElement?.scrollIntoView(),
  },
  {
    id: "calendar-view",
    title: "Calendar Features",
    description: "View your schedule, create new events, and receive AI-suggested optimal meeting times.",
    target: ".calendar-container",
    position: "top",
    route: "/calendar",
    showSkip: true,
    showNext: true,
    showBack: true,
  },
  {
    id: "tasks-intro",
    title: "Task Management",
    description: "Keep track of your tasks, set priorities, and never miss a deadline.",
    target: ".nav-item[href='/tasks']",
    position: "right",
    route: "/",
    showSkip: true,
    showNext: true,
    showBack: true,
    onClick: () => document.querySelector(".nav-item[href='/tasks']")?.parentElement?.scrollIntoView(),
  },
  {
    id: "tasks-view",
    title: "Manage Your Tasks",
    description: "Organize tasks by priority and due date. Mark them as complete when finished.",
    target: ".tasks-container",
    position: "top",
    route: "/tasks",
    showSkip: true,
    showNext: true,
    showBack: true,
  },
  {
    id: "customers-intro",
    title: "Customer Management",
    description: "Manage your customers, their information, and agents with our comprehensive customer portal.",
    target: ".nav-item[href='/customers']",
    position: "right",
    route: "/",
    showSkip: true,
    showNext: true,
    showBack: true,
    onClick: () => document.querySelector(".nav-item[href='/customers']")?.parentElement?.scrollIntoView(),
  },
  {
    id: "customers-view",
    title: "Customer Database",
    description: "Add, edit, and manage your customer database. Toggle between active and inactive customers.",
    target: ".customers-container",
    position: "top",
    route: "/customers",
    showSkip: true,
    showNext: true,
    showBack: true,
  },
  {
    id: "final-step",
    title: "You're All Set!",
    description: "You've completed the tour. Feel free to explore more features and start using PrimeX to streamline your operations.",
    target: "body",
    position: "center",
    route: "/",
    showSkip: false,
    showNext: false,
    showBack: true,
    showFinish: true,
  },
];

interface HighlightProps {
  target: string;
  position: string;
  children: React.ReactNode;
  show: boolean;
}

// Component to highlight a UI element
const Highlight: React.FC<HighlightProps> = ({ target, position, children, show }) => {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }

    const updatePosition = () => {
      if (target === "body") {
        setCoords({
          top: window.innerHeight / 2,
          left: window.innerWidth / 2,
          width: 0,
          height: 0,
        });
        setVisible(true);
        return;
      }

      const element = document.querySelector(target);
      if (!element) {
        setVisible(false);
        return;
      }

      const rect = element.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
      setVisible(true);
      
      // Scroll to the element if needed
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [target, show]);

  if (!visible) return null;

  // Position the tooltip based on the position prop
  let tooltipStyle = {};
  switch (position) {
    case "top":
      tooltipStyle = {
        bottom: "calc(100% + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
      };
      break;
    case "bottom":
      tooltipStyle = {
        top: "calc(100% + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
      };
      break;
    case "left":
      tooltipStyle = {
        right: "calc(100% + 10px)",
        top: "50%",
        transform: "translateY(-50%)",
      };
      break;
    case "right":
      tooltipStyle = {
        left: "calc(100% + 10px)",
        top: "50%",
        transform: "translateY(-50%)",
      };
      break;
    case "center":
      tooltipStyle = {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
      break;
  }

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{
        top: coords.top,
        left: coords.left,
        width: coords.width,
        height: coords.height,
      }}
    >
      <div
        className="absolute border-2 border-primary rounded-md"
        style={{
          top: -4,
          left: -4,
          width: coords.width + 8,
          height: coords.height + 8,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          className="absolute bg-white rounded-md p-4 shadow-lg pointer-events-auto"
          style={tooltipStyle as any}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

interface OnboardingTutorialProps {
  show: boolean;
  onComplete: () => void;
  startAtStep?: number;
}

const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({
  show,
  onComplete,
  startAtStep = 0,
}) => {
  const [currentStep, setCurrentStep] = useState(startAtStep);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Get the current step configuration
  const step = tutorialSteps[currentStep];

  // Navigate to the correct route when the step changes
  useEffect(() => {
    if (!show) return;
    
    const step = tutorialSteps[currentStep];
    if (step.route) {
      setLocation(step.route);
    }
    
    // Execute onClick function if provided
    if (step.onClick) {
      setTimeout(() => {
        step.onClick?.();
      }, 300);
    }
  }, [currentStep, show, setLocation]);

  // Skip or complete the tutorial
  const handleSkip = () => {
    toast({
      title: "Tutorial skipped",
      description: "You can restart the tutorial anytime from the help menu.",
    });
    
    // Save to localStorage that the user has seen the tutorial
    localStorage.setItem("tutorial_completed", "true");
    onComplete();
  };

  // Go to the next step
  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Go to the previous step
  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Complete the tutorial
  const handleFinish = () => {
    toast({
      title: "Tutorial completed",
      description: "You're now ready to use PrimeX! Explore and enjoy the system.",
    });
    
    // Save to localStorage that the user has completed the tutorial
    localStorage.setItem("tutorial_completed", "true");
    onComplete();
  };

  // Don't render if we shouldn't show the tutorial
  if (!show) return null;

  // For the welcome and final steps, show a dialog
  if (step.position === "center") {
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{step.title}</DialogTitle>
            <DialogDescription>{step.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-between">
            <div>
              {step.showBack && (
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
              )}
            </div>
            <div>
              {step.showSkip && (
                <Button variant="ghost" onClick={handleSkip} className="mr-2">
                  Skip Tour
                </Button>
              )}
              {step.showNext && (
                <Button onClick={handleNext}>
                  Next
                </Button>
              )}
              {step.showFinish && (
                <Button onClick={handleFinish}>
                  Finish
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // For all other steps, show a highlighted element with tooltip
  return (
    <Highlight
      target={step.target}
      position={step.position}
      show={true}
    >
      <div className="w-72">
        <h3 className="font-bold text-lg mb-1">{step.title}</h3>
        <p className="text-sm text-gray-600 mb-4">{step.description}</p>
        <div className="flex justify-between">
          <div>
            {step.showBack && (
              <Button variant="outline" size="sm" onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          <div>
            {step.showSkip && (
              <Button variant="ghost" size="sm" onClick={handleSkip} className="mr-2">
                Skip
              </Button>
            )}
            {step.showNext && (
              <Button size="sm" onClick={handleNext}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </Highlight>
  );
};

// Helper component to add a "Take a Tour" button to the UI
export const TourButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex items-center text-primary hover-blue rounded-md" 
            onClick={onClick}
          >
            <span className="material-icons mr-1 text-sm">help_outline</span>
            Take a Tour
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Start the guided tour of PrimeX</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default OnboardingTutorial;