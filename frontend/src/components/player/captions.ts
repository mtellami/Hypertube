import type { TreeNode, TreeNodeObjectTagNameWithRt } from "webvtt-parser";
import type { SubtitleInfo } from "../../api/client";

// The parser's default table omits the terminator from these WebVTT escapes.
const cueEntities = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&lrm;": "\u200e",
  "&rlm;": "\u200f",
  "&nbsp;": "\u00a0",
};

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

/** undefined follows the language preference, null keeps captions off. */
export type SubtitleChoice = string | null | undefined;

export function selectedTrack(
  tracks: SubtitleInfo[],
  choice: SubtitleChoice,
  preferred: string | null,
) {
  const language = choice === undefined ? preferred : choice;
  return tracks.find((track) => track.lang === language);
}

function plainText(children: TreeNode<TreeNodeObjectTagNameWithRt>[]): string {
  return children
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "object") return plainText(node.children);
      return "";
    })
    .join("");
}

export async function parseCaptions(text: string): Promise<CaptionCue[]> {
  const { default: WebVTT } = await import("webvtt-parser");
  return new WebVTT.WebVTTParser(cueEntities)
    .parse(text, "subtitles")
    .cues.map((cue) => ({
      start: cue.startTime,
      end: cue.endTime,
      text: plainText(cue.tree.children).trim(),
    }))
    .filter((cue) => cue.text && cue.end > cue.start)
    .sort((a, b) => a.start - b.start);
}

export function activeCaption(
  cues: CaptionCue[],
  streamOffset: number,
  mediaTime: number,
) {
  const time = streamOffset + mediaTime;
  return cues.find((cue) => cue.start <= time && time < cue.end);
}
