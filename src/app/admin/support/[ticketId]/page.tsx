import type { Metadata } from 'next';
import { Headphones } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';
import { requirePlatformAdmin } from '@/lib/admin';

export const metadata: Metadata = { title: 'Support Ticket' };

export default async function Page() {
  await requirePlatformAdmin();
  return <SectionShell title="Support Ticket" icon={Headphones} />;
}
