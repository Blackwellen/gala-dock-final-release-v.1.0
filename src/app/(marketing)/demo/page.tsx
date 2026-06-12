import type { Metadata } from 'next';
import { Play } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Live Demo' };

export default function Page() {
  return <SectionShell title="Live Demo" icon={Play} />;
}
