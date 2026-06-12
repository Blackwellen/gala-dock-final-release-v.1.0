import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  id: number;
  label: string;
  description?: string;
}

interface WizardStepperProps {
  steps: Step[];
  current: number;
  className?: string;
}

export function WizardStepper({ steps, current, className }: WizardStepperProps) {
  return (
    <nav className={cn("flex items-center gap-0", className)} aria-label="Progress">
      {steps.map((step, i) => {
        const done = step.id < current;
        const active = step.id === current;
        const upcoming = step.id > current;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all",
                  done && "bg-brand-600 border-brand-600 text-white",
                  active && "bg-white border-brand-600 text-brand-600",
                  upcoming && "bg-white border-surface-200 text-surface-400"
                )}
              >
                {done ? <Check className="w-4 h-4" strokeWidth={2.5} /> : step.id}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[11px] font-medium hidden md:block whitespace-nowrap",
                  active ? "text-brand-700" : done ? "text-surface-600" : "text-surface-400"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-8 sm:w-14 lg:w-20 mx-1 mb-5 transition-colors",
                  step.id < current ? "bg-brand-600" : "bg-surface-200"
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
