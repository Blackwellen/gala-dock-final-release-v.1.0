import type { Metadata } from 'next';
import { Heart } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'For Weddings' };

export default function Page() {
  return <SectionShell title="For Weddings" icon={Heart} />;
}
