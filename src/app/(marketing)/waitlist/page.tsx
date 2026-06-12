import type { Metadata } from 'next';
import { Clock } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Join the Waitlist' };

export default function Page() {
  return <SectionShell title="Join the Waitlist" icon={Clock} />;
}
