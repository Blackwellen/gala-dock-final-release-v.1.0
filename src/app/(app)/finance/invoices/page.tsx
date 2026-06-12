import type { Metadata } from 'next';
import { Receipt } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Invoices' };

export default function Page() {
  return <SectionShell title="Invoices" icon={Receipt} />;
}
