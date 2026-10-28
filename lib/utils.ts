import { createCn } from "cn/config";

/** Cue's two tracking tokens are custom, so the merger has to be told they conflict, or both classes stay and the display tracking wins. */
export const cn = createCn({ extend: { classGroups: { tracking: [{ tracking: ["caps", "display"] }] } } });
