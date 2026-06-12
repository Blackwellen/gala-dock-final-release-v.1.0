import type { Metadata } from 'next';
import { CreditCard } from 'lucide-react';
import { SectionShell } from '@/components/ui/SectionShell';

export const metadata: Metadata = { title: 'Payments' };

export default function Page() {
  return <SectionShell title="Payments" icon={CreditCard} />;
}
