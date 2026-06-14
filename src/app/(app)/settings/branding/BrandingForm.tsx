"use client";

import { useState, useTransition } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import { updateBranding } from "./actions";

const LABEL_CLS = "block text-sm font-medium text-surface-700 mb-1.5";

interface BrandingFormProps {
  initialColor: string;
  workspaceName: string;
}

export function BrandingForm({ initialColor, workspaceName }: BrandingFormProps) {
  const [brandColor, setBrandColor] = useState(initialColor || "#4F46E5");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    const fd = new FormData();
    fd.set("brand_color", brandColor);
    startTransition(async () => {
      const res = await updateBranding(fd);
      if (res?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res?.error ?? "Could not save branding.");
      }
    });
  }

  const initials = workspaceName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: form */}
        <div className="space-y-6">
          {/* Logo */}
          <div>
            <p className={LABEL_CLS}>Workspace Logo</p>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-surface-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors">
              <Upload className="w-6 h-6 text-surface-400 mb-1.5" strokeWidth={1.8} />
              <span className="text-sm text-surface-500">Click to upload logo</span>
              <span className="text-xs text-surface-400 mt-1">PNG, SVG or JPG · Max 2 MB</span>
              <input type="file" accept="image/*" className="sr-only" />
            </label>
          </div>

          {/* Favicon */}
          <div>
            <p className={LABEL_CLS}>Favicon</p>
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-surface-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors">
              <ImageIcon className="w-5 h-5 text-surface-400 mb-1.5" strokeWidth={1.8} />
              <span className="text-sm text-surface-500">Upload favicon</span>
              <span className="text-xs text-surface-400 mt-1">ICO or PNG · 32×32 px</span>
              <input type="file" accept=".ico,image/png" className="sr-only" />
            </label>
          </div>

          {/* Brand colour */}
          <div>
            <p className={LABEL_CLS}>Brand Colour</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-12 h-10 rounded-lg border border-surface-200 cursor-pointer p-0.5 bg-white"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setBrandColor(v);
                }}
                className="px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 w-36 font-mono uppercase"
                maxLength={7}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save branding"}
            </button>
            {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
            {error && <span className="text-sm text-danger-600 font-medium">{error}</span>}
          </div>
        </div>

        {/* Right: preview */}
        <div>
          <p className={LABEL_CLS}>Preview</p>
          <div className="bg-surface-50 border border-surface-200 rounded-xl p-5 space-y-4">
            <div className="bg-white border border-surface-200 rounded-lg p-4 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: brandColor }}
              >
                {initials || "GA"}
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-900">{workspaceName}</p>
                <p className="text-xs text-surface-400">Event Management</p>
              </div>
            </div>
            <div className="bg-white border border-surface-200 rounded-lg p-4">
              <button
                className="w-full py-2 text-sm font-medium text-white rounded-lg transition-colors"
                style={{ backgroundColor: brandColor }}
              >
                Book your event
              </button>
            </div>
            <div className="bg-white border border-surface-200 rounded-lg p-4">
              <div
                className="h-1 rounded-full"
                style={{ backgroundColor: brandColor, width: "60%" }}
              />
              <p className="text-xs text-surface-400 mt-2">Accent colour in UI</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
