import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Data Processing Agreement' };

export default function Page() {
  return <SectionShell title="Data Processing Agreement" icon={FileText} />;
}
