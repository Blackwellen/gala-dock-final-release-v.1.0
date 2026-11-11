"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { conversionFor, trackPublic, type PublicEvent } from "./track";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string; event?: PublicEvent; surface: string; variant?: string };

/** A normal next/link that records the blueprint analytics event (and the conversion it represents) on click. */
export function TLink({ href, event = "section_interaction", surface, variant, onClick, ...rest }: Props) {
  return <Link href={href} {...rest} onClick={e => {
    trackPublic(event, surface, variant ?? href);
    const conv = conversionFor(href);
    if (conv && conv !== event) trackPublic(conv, surface, variant ?? href);
    onClick?.(e);
  }} />;
}
