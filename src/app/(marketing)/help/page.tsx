import type { Metadata } from 'next';
import { HelpCircle } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Help Centre' };

export default function Page() {
  return <SectionShell title="Help Centre" icon={HelpCircle} />;
}
