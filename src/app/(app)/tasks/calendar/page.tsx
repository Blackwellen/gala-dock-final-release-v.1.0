import type { Metadata } from 'next';
import { Calendar } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Task Calendar' };

export default function Page() {
  return <SectionShell title="Task Calendar" icon={Calendar} />;
}
