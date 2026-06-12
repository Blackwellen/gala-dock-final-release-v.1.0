import type { Metadata } from 'next';
import { Headphones } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Support Ticket' };

export default function Page() {
  return <SectionShell title="Support Ticket" icon={Headphones} />;
}
