"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleX, CirclePlus } from "lucide-react";
import { Photo } from "./ui";

type Base = { label: ReactNode; error?: string; hint?: string; hintAbove?: boolean; required?: boolean; optional?: boolean; icon?: ReactNode };

function Shell({ id, label, error, hint, hintAbove, required, optional, children }: Base & { id: string; children: ReactNode }) {
  return <div className={`field ${error ? "has-error" : ""} ${hintAbove ? "hint-above" : ""}`}>
    <label htmlFor={id}><span>{label}{optional && <i className="optional"> (optional)</i>}{required && <b className="required" aria-hidden="true"> *</b>}</span></label>
    {hintAbove && hint && <small id={`${id}-hint`} className="hint">{hint}</small>}
    {children}
    {error ? <small id={`${id}-error`} className="field-error" role="alert">{error}</small> : hint && !hintAbove ? <small id={`${id}-hint`}>{hint}</small> : null}
  </div>;
}
const describedBy = (id: string, error?: string, hint?: string) => error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField({ value, onChange, type = "text", placeholder, maxLength, autoComplete, inputMode, ...base }: Base & {
  value: string; onChange: (value: string) => void; type?: string; placeholder?: string; maxLength?: number; autoComplete?: string; inputMode?: "numeric" | "email" | "url";
}) {
  const id = useId();
  return <Shell id={id} {...base}><div className={`input-wrap ${base.icon ? "with-icon" : ""}`}>{base.icon}
    <input id={id} type={type} value={value} placeholder={placeholder} maxLength={maxLength} autoComplete={autoComplete} inputMode={inputMode}
      onChange={e => onChange(e.target.value)} aria-invalid={!!base.error} aria-required={base.required} aria-describedby={describedBy(id, base.error, base.hint)} />
    {maxLength && <span className="counter" aria-hidden="true">{value.length}/{maxLength}</span>}</div></Shell>;
}

export function TextArea({ value, onChange, rows = 4, maxLength, placeholder, ...base }: Base & { value: string; onChange: (value: string) => void; rows?: number; maxLength?: number; placeholder?: string }) {
  const id = useId();
  return <Shell id={id} {...base}><div className="textarea-wrap"><textarea id={id} rows={rows} value={value} maxLength={maxLength} placeholder={placeholder} onChange={e => onChange(e.target.value)}
    aria-invalid={!!base.error} aria-required={base.required} aria-describedby={describedBy(id, base.error, base.hint)} />{maxLength && <span className="counter" aria-hidden="true">{value.length}/{maxLength}</span>}</div></Shell>;
}

export function SelectField({ value, onChange, options, placeholder, ...base }: Base & { value: string; onChange: (value: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string }) {
  const id = useId();
  return <Shell id={id} {...base}><div className={`select-wrap ${base.icon ? "with-icon" : ""}`}>{base.icon}
    <select id={id} value={value} onChange={e => onChange(e.target.value)} aria-invalid={!!base.error} aria-required={base.required} aria-describedby={describedBy(id, base.error, base.hint)}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select><ChevronDown size={16} aria-hidden="true" /></div></Shell>;
}

/** Card/chip choices. Multi-select uses checkboxes, single-select uses radios, so keyboard and screen readers work natively. */
export function ChoiceGroup({ legend, question, variant, maxVisible, moreLabel = "Add more", name, items, value, onChange, multi = false, images, descriptions, icons, error, columns, hideLegend = false }: {
  legend: string; question?: string; variant?: "chips"; maxVisible?: number; moreLabel?: string; name: string; items: (string | { value: string; label: string })[]; value: string[]; onChange: (value: string[]) => void; multi?: boolean;
  images?: string[]; descriptions?: string[]; icons?: ReactNode[]; error?: string; columns?: number; hideLegend?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const all = items.map(i => typeof i === "string" ? { value: i, label: i } : i);
  // Collapsed lists always keep selected options visible.
  const options = maxVisible && !expanded ? all.filter((o, i) => i < maxVisible || value.includes(o.value)) : all;
  return <fieldset className={`choice-fieldset ${error ? "has-error" : ""}`} aria-describedby={error ? `${id}-error` : undefined}>
    <legend className={hideLegend ? "sr-only" : undefined}>{legend}</legend>
    {question && <p className="muted question">{question}</p>}
    <div className={`choice-group ${images ? "with-images" : ""} ${variant ?? ""}`} style={columns ? { gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` } : undefined}>
      {options.map((item, i) => {
        const checked = value.includes(item.value);
        return <label key={item.value} className={`choice ${checked ? "selected" : ""}`}>
          <input type={multi ? "checkbox" : "radio"} name={name} value={item.value} checked={checked}
            onChange={() => onChange(multi ? (checked ? value.filter(v => v !== item.value) : [...value, item.value]) : [item.value])} />
          {images ? images[i] ? <Photo name={images[i]} alt="" /> : <span className="choice-art" aria-hidden="true">{icons?.[i]}</span> : null}
          <span>{variant === "chips" ? null : icons?.[i]}<b>{item.label}{descriptions?.[i] && <small>{descriptions[i]}</small>}</b>{variant === "chips" ? (checked ? <CircleX className="chip-icon" size={14} aria-hidden="true" /> : <CirclePlus className="chip-icon" size={14} aria-hidden="true" />) : multi && images ? <i className="box" aria-hidden="true">{checked && <Check size={12} />}</i> : checked && <Check size={17} aria-hidden="true" />}</span>
        </label>;
      })}
      {maxVisible && all.length > options.length && <button type="button" className="chip-more" onClick={() => setExpanded(true)}>+ {moreLabel}</button>}
    </div>
    {error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}
  </fieldset>;
}

export function Toggle({ label, description, checked, onChange, error }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  return <label className={`switch-label ${error ? "has-error" : ""}`}>
    <input type="checkbox" role="switch" checked={checked} aria-checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>{label}{description && <small>{description}</small>}{error && <small className="field-error" role="alert">{error}</small>}</span>
  </label>;
}
