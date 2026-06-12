import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Cookie Policy' };

export default function Page() {
  return <SectionShell title="Cookie Policy" icon={FileText} />;
}
