import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'For Venues' };

export default function Page() {
  return <SectionShell title="For Venues" icon={Building2} />;
}
