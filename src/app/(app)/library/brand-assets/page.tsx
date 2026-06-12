"use client";

import { Upload, Image } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

const BRAND_COLOURS = [
  { name: "Primary Brand",  hex: "#4F46E5" },
  { name: "Brand Light",    hex: "#818CF8" },
  { name: "Success Green",  hex: "#16A34A" },
  { name: "Warning Amber",  hex: "#D97706" },
  { name: "Danger Red",     hex: "#DC2626" },
  { name: "Surface Dark",   hex: "#1E293B" },
];

const BRAND_FONTS = [
  { name: "Primary Typeface",  value: "Inter",       usage: "Body text, UI elements" },
  { name: "Display Typeface",  value: "Sora",        usage: "Headings, hero text"   },
  { name: "Monospace",         value: "JetBrains Mono", usage: "Code, references"   },
];

export default function BrandAssetsPage() {
  const [colours, setColours] = useState(BRAND_COLOURS);

  function updateColour(index: number, hex: string) {
    setColours((prev) => prev.map((c, i) => (i === index ? { ...c, hex } : c)));
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Brand Assets"
        description="Logos, colour palettes and typography for your brand"
      />

      <div className="flex-1 p-6 space-y-8 max-w-4xl">

        {/* Primary Logo */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Primary Logo</h2>
          <label className="flex flex-col items-center justify-center gap-3 w-full max-w-sm border-2 border-dashed border-surface-200 rounded-xl p-8 hover:border-brand-400 hover:bg-brand-50/30 transition-colors cursor-pointer">
            <input type="file" className="hidden" accept="image/*,.svg" />
            <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
              <Upload className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-surface-700">Upload Primary Logo</p>
              <p className="text-xs text-surface-400 mt-1">SVG, PNG or JPG · recommended 400×100px</p>
            </div>
          </label>

          <div className="mt-4">
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Other Logo Variants</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {["Dark Background Logo", "Icon / Favicon", "Horizontal Lockup"].map((variant) => (
                <label key={variant} className="flex flex-col items-center justify-center gap-2 border border-dashed border-surface-200 rounded-lg p-4 hover:border-brand-300 hover:bg-brand-50/20 transition-colors cursor-pointer">
                  <input type="file" className="hidden" accept="image/*,.svg" />
                  <Image className="w-5 h-5 text-surface-300" strokeWidth={1.8} />
                  <span className="text-xs font-medium text-surface-500 text-center">{variant}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Brand Colours */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Brand Colours</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {colours.map((colour, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div
                  className="w-full h-16 rounded-xl border border-surface-200 shadow-sm"
                  style={{ backgroundColor: colour.hex }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-700">{colour.name}</span>
                </div>
                <input
                  type="text"
                  value={colour.hex}
                  onChange={(e) => updateColour(i, e.target.value)}
                  className="w-full px-2 py-1.5 rounded-md border border-surface-200 text-xs text-surface-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            ))}
          </div>
          <button className="mt-4 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors">
            Save Colours
          </button>
        </div>

        {/* Typography */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Typography</h2>
          <div className="space-y-3">
            {BRAND_FONTS.map((font, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-surface-50 border border-surface-100">
                <div>
                  <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">{font.name}</p>
                  <p className="text-base font-semibold text-surface-900 mt-0.5" style={{ fontFamily: font.value }}>
                    {font.value}
                  </p>
                  <p className="text-xs text-surface-400 mt-0.5">{font.usage}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
