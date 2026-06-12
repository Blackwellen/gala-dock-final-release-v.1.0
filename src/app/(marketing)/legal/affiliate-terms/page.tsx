import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Affiliate Terms' };

export default function Page() {
  return <SectionShell title="Affiliate Terms" icon={FileText} />;
}
