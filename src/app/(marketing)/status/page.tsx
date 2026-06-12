import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'System Status' };

export default function Page() {
  return <SectionShell title="System Status" icon={Activity} />;
}
