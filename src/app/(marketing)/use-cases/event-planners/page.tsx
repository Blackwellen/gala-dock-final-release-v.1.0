import type { Metadata } from 'next';
import { CalendarDays } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'For Event Planners' };

export default function Page() {
  return <SectionShell title="For Event Planners" icon={CalendarDays} />;
}
