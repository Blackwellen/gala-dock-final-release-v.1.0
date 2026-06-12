import type { Metadata } from 'next';
import { Briefcase } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'For Agencies' };

export default function Page() {
  return <SectionShell title="For Agencies" icon={Briefcase} />;
}
