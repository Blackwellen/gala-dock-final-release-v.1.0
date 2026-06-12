import type { Metadata } from 'next';
import { TrendingUp } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Profit' };

export default function Page() {
  return <SectionShell title="Profit" icon={TrendingUp} />;
}
