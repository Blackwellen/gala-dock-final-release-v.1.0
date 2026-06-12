import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Subprocessors' };

export default function Page() {
  return <SectionShell title="Subprocessors" icon={FileText} />;
}
