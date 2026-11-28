import * as Slider from "@radix-ui/react-slider";
import { useRef, useState } from "react";
import { formatDuration } from "../../common/format";
import { useI18n } from "../../common/i18n";

interface Props {
  duration: number;
  time: number;
  bufferedPct: number;
  seekTo: (time: number) => void;
}

export default function PlayerSeekBar({
  duration,
  time,
  bufferedPct,
  seekTo,
}: Props) {
  const { t } = useI18n();
  const dragging = useRef(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, duration);
  const value = Math.max(0, Math.min(preview ?? time, max));
  const endDrag = () => {
    dragging.current = false;
    setPreview(null);
  };

  return (
    <Slider.Root
      className="seekbar group relative flex h-4.5 touch-none items-center mb-1 cursor-pointer data-[disabled]:cursor-default data-[disabled]:opacity-50"
      min={0}
      max={max}
      step={1}
      disabled={!duration}
      value={[value]}
      onValueChange={([next]) => {
        if (dragging.current) setPreview(next);
      }}
      onValueCommit={([next]) => seekTo(next)}
      onPointerDown={() => {
        dragging.current = true;
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onPointerMove={(event) => {
        const { left, width } = event.currentTarget.getBoundingClientRect();
        if (width && duration)
          setHover(Math.min(1, Math.max(0, (event.clientX - left) / width)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <Slider.Track className="seek-track relative w-full h-1 rounded-full bg-white/20 overflow-hidden transition-[height] group-hover:h-1.5 group-focus-within:h-1.5">
        <span
          className="absolute inset-[0_auto_0_0] bg-white/35"
          style={{ width: `${bufferedPct}%` }}
        />
        <Slider.Range className="seek-progress absolute h-full bg-(image:--accent-grad)" />
      </Slider.Track>
      <Slider.Thumb
        className="seek-thumb block w-3.5 h-3.5 rounded-full bg-white scale-0 shadow-[0_0_0_4px_rgba(var(--accent-rgb),_0.35)] transition-transform group-hover:scale-100 focus-visible:scale-100 focus-visible:outline-2 focus-visible:outline-highlight"
        aria-label={t("player.seek")}
        aria-valuetext={formatDuration(value)}
      />
      {hover !== null && duration > 0 && (
        <span
          className="seek-tooltip absolute bottom-5.5 [translate:-50%_0] rounded-[6px] bg-black/85 px-2 py-[3px] text-[0.75rem] tabular-nums pointer-events-none"
          style={{ left: `${hover * 100}%` }}
          aria-hidden="true"
        >
          {formatDuration(hover * duration)}
        </span>
      )}
    </Slider.Root>
  );
}
