import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Page() {
  return <SectionShell title="Privacy Policy" icon={FileText} />;
}
