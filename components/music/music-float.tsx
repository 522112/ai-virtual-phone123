// components/music/music-float.tsx — Dynamic Island music live activity body
"use client";

import type { MusicTrack } from "@/lib/music-storage";

export function MusicIslandBody({
  track,
  isPlaying,
  onPrev,
  onTogglePlay,
  onNext,
}: {
  track: MusicTrack;
  isPlaying: boolean;
  onPrev: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
}) {
  return (
    <div className="music-float-inner">
      <div className="music-float-cover-wrap">
        {track.coverUrl ? (
          <img src={track.coverUrl} alt="" className="music-float-cover-img" draggable={false} />
        ) : (
          <div className="music-float-cover-placeholder">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        )}
      </div>

      <div className="music-float-wave" aria-hidden>
        <span /><span /><span /><span />
      </div>

      <div className="music-float-info">
        <div className="music-float-title">{track.title}</div>
        <div className="music-float-artist">{track.artist}</div>
      </div>

      <div className="music-float-controls">
        <button type="button" className="music-float-btn" onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="上一首">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
        <button type="button" className="music-float-btn music-float-btn-play" onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} aria-label={isPlaying ? "暂停" : "播放"}>
          {isPlaying ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button type="button" className="music-float-btn" onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="下一首">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
