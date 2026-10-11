"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, MotionConfig, AnimatePresence, type HTMLMotionProps } from "framer-motion";
import { useState, createContext, useContext, type ReactNode, type ButtonHTMLAttributes } from "react";
import { ArrowRight, Check, X, Sparkles, ChevronDown, type LucideIcon } from "lucide-react";
import regeneratedAssets from "@/lib/regenerated-assets.json";
import assetDimensions from "@/lib/asset-dimensions.json";

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function Providers({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState("");
  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 5000);
  }
  return <MotionConfig reducedMotion="user"><ToastContext.Provider value={notify}>{children}<AnimatePresence>{toast && <motion.div role="status" className="toast" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, y: 20 }}><Check size={20} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={18} /></button></motion.div>}</AnimatePresence></ToastContext.Provider></MotionConfig>;
}

/** Official Gala·Dock wordmark (public/brand). `light` renders it white for dark backgrounds; `mark` shows the symbol only. */
export function Logo({ light = false, small = false, mark = false, href = "/" }: { light?: boolean; small?: boolean; mark?: boolean; href?: string }) {
  return <Link href={href} className={`logo ${light ? "light" : ""} ${small ? "small" : ""} ${mark ? "mark-only" : ""}`} aria-label="Gala Dock home">
    <Image className="logo-img" src={mark ? "/brand/gala-dock-mark.png" : "/brand/gala-dock-logo.png"} alt="Gala·Dock" width={mark ? 137 : 500} height={129} sizes={mark ? "64px" : "260px"} priority />
  </Link>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "soft" | "white"; arrow?: boolean; children: ReactNode; href?: string };
export function Button({ variant = "primary", arrow = false, children, href, className = "", ...props }: ButtonProps) {
  const content = <>{children}{arrow && <ArrowRight size={16} aria-hidden="true" />}</>;
  if (href) return <Link className={`button ${variant} ${className}`} href={href}>{content}</Link>;
  return <motion.button {...props as HTMLMotionProps<"button">} whileHover={{ y: -1 }} whileTap={{ scale: .98 }} className={`button ${variant} ${className}`} type={props.type ?? "button"}>{content}</motion.button>;
}

export function IconTile({ icon: Icon, color = "blue" }: { icon: LucideIcon; color?: string }) {
  return <span className={`icon-tile ${color}`}><Icon size={22} aria-hidden="true" /></span>;
}
export function Photo({ name, alt = "", className = "" }: { name: string; alt?: string; className?: string }) {
  const regenerated = regeneratedAssets as Record<string, string>;
  const [width,height]=(assetDimensions as Record<string,number[]>)[name]??[750,500];
  return <Image className={`photo ${className}`} src={regenerated[name] ?? `/assets/${name}.webp`} alt={alt} width={width} height={height} sizes={name.startsWith("avatar-")?"48px":"(max-width: 700px) 50vw, (max-width: 1250px) 33vw, 720px"} preload={name==="home-hero"} loading={name==="home-hero"?undefined:"lazy"} />;
}
export function CheckList({ items }: { items: string[] }) {
  return <ul className="check-list">{items.map(item => <li key={item}><Check size={15} aria-hidden="true" /><span>{item}</span></li>)}</ul>;
}
export function SectionTitle({ children, action = "View all", href, onClick }: { children: ReactNode; action?: string; href?: string; onClick?: () => void }) {
  return <div className="section-title"><h2>{children}</h2>{href ? <Link href={href}>{action} <ArrowRight size={14} /></Link> : onClick ? <button onClick={onClick}>{action} <ArrowRight size={14} /></button> : null}</div>;
}
export function Field({ label, name, defaultValue, placeholder, required = false, type = "text", children, hint }: { label: ReactNode; name: string; defaultValue?: string; placeholder?: string; required?: boolean; type?: string; children?: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}{required && <b className="required"> *</b>}</span>{children ? <div className="select-wrap"><select name={name} defaultValue={defaultValue} required={required}>{children}</select><ChevronDown size={16} /></div> : <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} />}{hint && <small>{hint}</small>}</label>;
}
export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  return <AnimatePresence>{open && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.section role="dialog" aria-modal="true" aria-label={title} className="modal" initial={{ opacity: 0, y: 25, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} onClick={e => e.stopPropagation()}><div className="section-title"><h2>{title}</h2><button onClick={onClose} aria-label="Close dialog"><X /></button></div>{children}</motion.section></motion.div>}</AnimatePresence>;
}
export function AgentCard({ title = "Gala Agent", text = "Get personalized recommendations, find venues, and plan your next event.", onClick }: { title?: string; text?: string; onClick?: () => void }) {
  return <div className="agent-card"><IconTile icon={Sparkles} color="purple" /><h3>{title}</h3><p>{text}</p><Button onClick={onClick} arrow>Try Gala Agent</Button></div>;
}
