import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Page() {
  return <SectionShell title="Terms of Service" icon={FileText} />;
}
