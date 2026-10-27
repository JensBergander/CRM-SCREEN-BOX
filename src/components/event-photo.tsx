"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { uploadWebsiteImageAction } from "@/app/(app)/actions";

// Handyfotos auf höchstens 2400 px verkleinern (wie die Website), das spart Zeit im Mobilfunk
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.88));
}

// Kamera hinter dem Vorgangstitel: Foto für das Event auf screen-box.de (Kopfbild auf /treffen)
export function EventPhoto({ dealId, image }: { dealId: number; image: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        aria-label={image ? "Event-Foto ersetzen" : "Foto für das Event auf der Website hochladen"}
        title={image ? "Event-Foto ersetzen" : "Foto für das Event auf der Website hochladen"}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-bg ${image ? "text-ok" : "text-muted hover:text-ink"}`}
      >
        {pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
      </button>
      {/* fremde Domain, kleines Vorschaubild: next/image lohnt hier nicht */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} alt="Event-Foto" className="h-9 w-12 rounded-md object-cover" />}
      {error && <span role="alert" className="text-sm text-danger-ink">{error}</span>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          startTransition(async () => {
            const form = new FormData();
            form.append("file", new File([await shrink(file)], "event.jpg", { type: "image/jpeg" }));
            setError((await uploadWebsiteImageAction(dealId, form)).error);
          });
        }}
      />
    </div>
  );
}
