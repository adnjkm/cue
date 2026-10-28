import { BookOpen, Calendar, FileText, Mic, SquareCheckBig, Sun, type LucideIcon } from "lucide-react";
import { ids, type BlockId, type CourseId, type LectureId, type LocalDate, type QuestionId, type SectionId, type SetId } from "@/lib/domain/ids";
import type { GenerationScope } from "@/lib/domain/practice";
import type { ViewerTab } from "@/lib/domain/study";

export type CalendarView = "day" | "week" | "month";

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(param: string): string {
  const bin = atob(param.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** `?generate=` codec. Decoding returns unknown: the Practice route validates the shape it gets. */
export const generateParam = {
  encode: (scope: GenerationScope): string => toBase64Url(JSON.stringify(scope)),
  decode: (param: string): unknown => {
    try {
      return JSON.parse(fromBase64Url(param));
    } catch {
      return null;
    }
  },
} as const;

/** Every cross-feature link is built here. Features parse their own search params. */
export const href = {
  today: (): string => "/",
  calendar: (p?: { view?: CalendarView; date?: LocalDate; add?: true }): string =>
    withQuery("/calendar", { view: p?.view, date: p?.date, add: p?.add ? "1" : undefined }),
  studyIndex: (): string => "/study",
  /** Without `start` the page is a read-only preview and creates no session. */
  study: (block: BlockId, p?: { start?: true; tab?: ViewerTab }): string =>
    withQuery(`/study/${block}`, { start: p?.start ? "1" : undefined, tab: p?.tab }),
  lectures: (): string => "/lectures",
  lecture: (id: LectureId, p?: { atMs?: number }): string => withQuery(`/lectures/${id}`, { t: p?.atMs === undefined ? undefined : String(Math.round(p.atMs)) }),
  practice: (p?: { generate?: GenerationScope }): string => withQuery("/practice", { generate: p?.generate ? generateParam.encode(p.generate) : undefined }),
  practiceSet: (id: SetId, p?: { q?: QuestionId; topic?: string }): string => withQuery(`/practice/${id}`, { q: p?.q, topic: p?.topic }),
  guides: (): string => "/guides",
  guide: (course: CourseId, section?: SectionId): string => (section ? `/guides/${course}/${ids.sectionSlug(section)}` : `/guides/${course}`),
  guideExport: (course: CourseId): string => `/export/guide/${course}`,
} as const;

export type NavKey = "today" | "calendar" | "study" | "lectures" | "practice" | "guides";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV: readonly NavItem[] = [
  { key: "today", label: "Today", href: href.today(), icon: Sun },
  { key: "calendar", label: "Calendar", href: href.calendar(), icon: Calendar },
  { key: "study", label: "Study sessions", href: href.studyIndex(), icon: BookOpen },
  { key: "lectures", label: "Lecture notes", href: href.lectures(), icon: Mic },
  { key: "practice", label: "Practice", href: href.practice(), icon: SquareCheckBig },
  { key: "guides", label: "Study guides", href: href.guides(), icon: FileText },
];

/** The nav item a pathname belongs to, so focus screens under /study/… still mark Study sessions. */
export function navKeyFor(pathname: string): NavKey | null {
  if (pathname === "/") return "today";
  const first = pathname.split("/")[1];
  const map: Record<string, NavKey> = { calendar: "calendar", study: "study", lectures: "lectures", practice: "practice", guides: "guides", export: "guides" };
  return map[first] ?? null;
}
