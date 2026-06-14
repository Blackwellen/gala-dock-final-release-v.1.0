import { requireWorkspace } from "@/lib/workspace";
import { InvoiceForm } from "./InvoiceForm";

export const metadata = { title: "New Invoice" };

export default async function NewInvoicePage() {
  // Ensure an authenticated workspace context before rendering the form.
  await requireWorkspace();
  return <InvoiceForm />;
}
