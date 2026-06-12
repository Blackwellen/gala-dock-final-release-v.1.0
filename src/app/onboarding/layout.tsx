import Image from "next/image";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-surface-50 flex flex-col">
      <header className="h-16 bg-white border-b border-surface-200 flex items-center px-6">
        <Image src="/gala-dock-logo.png" alt="Gala Dock" width={120} height={32} priority />
      </header>
      <div className="flex-1 flex flex-col items-center justify-start py-10 px-4">
        {children}
      </div>
    </div>
  );
}
