import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Task Templates' };

export default function Page() {
  return <SectionShell title="Task Templates" icon={FileText} />;
}
