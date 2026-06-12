import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Export Event' };

export default function Page() {
  return <SectionShell title="Export Event" icon={Download} />;
}
