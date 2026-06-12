import type { Metadata } from 'next';
import { Users2 } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'For Suppliers' };

export default function Page() {
  return <SectionShell title="For Suppliers" icon={Users2} />;
}
