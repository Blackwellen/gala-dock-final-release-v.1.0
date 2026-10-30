"use client";
import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { embedUrl, type Video } from "@/lib/public/video";

/**
 * Click-to-load video: until the visitor presses play, only our own poster image is shown and no request goes to YouTube / Vimeo
 * (the click is the visitor's choice to connect). Then a sandboxed privacy-mode iframe is created from the parsed id.
 */
export function VideoEmbed({ video, poster, title }: { video: Video; poster: string | null; title: string }) {
  const [on, setOn] = useState(false);
  const host = video.provider === "youtube" ? "YouTube" : "Vimeo";
  return <div className="px-video">
    {on ? <iframe src={embedUrl(video)} title={title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; fullscreen; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" />
      : <button type="button" className="px-video-poster" onClick={() => setOn(true)} aria-label={`Play video: ${title} (loads from ${host})`}>
          {poster && /* eslint-disable-next-line @next/next/no-img-element */ <img src={poster} alt="" />}
          <span className="px-video-play"><PlayCircle size={56} aria-hidden /></span>
          <small>Plays from {host}{video.provider === "youtube" ? " in privacy-enhanced mode" : " with tracking off"}. Nothing loads until you press play.</small>
        </button>}
  </div>;
}
