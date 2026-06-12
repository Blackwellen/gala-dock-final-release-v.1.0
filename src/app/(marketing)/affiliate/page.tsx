import type { Metadata } from 'next';
import { Link2 } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Affiliate Programme' };

export default function Page() {
  return <SectionShell title="Affiliate Programme" icon={Link2} />;
}
