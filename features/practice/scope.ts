import { z } from "zod";
import { parseId, type CourseId, type GenerationScope, type MessageId, type QuestionId, type SectionId } from "@/lib/domain";
import { generateParam } from "@/lib/routes";

const courseId = z.custom<CourseId>((v) => typeof v === "string" && parseId.course(v) !== null);
const sectionId = z.custom<SectionId>((v) => typeof v === "string" && /^[A-Z0-9]+\.[a-z0-9-]+$/.test(v));
const messageId = z.custom<MessageId>((v) => typeof v === "string" && /^msg_[\w-]+$/.test(v));
const questionId = z.custom<QuestionId>((v) => typeof v === "string" && parseId.question(v) !== null);

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("topic"),
    courseId,
    topic: z.string().trim().min(1).max(200),
    missedOnly: z.boolean(),
    count: z.union([z.literal(3), z.literal(5), z.literal(10)]),
    note: z.string().max(500).optional(),
  }),
  z.object({ kind: z.literal("similar"), questionId }),
  z.object({ kind: z.literal("section"), courseId, sectionId }).refine((s) => s.sectionId.startsWith(`${s.courseId}.`), "The section belongs to another course."),
  z.object({ kind: z.literal("message"), courseId, messageId }),
]);

/** `?generate=` is untrusted: anything that is not a well-formed scope is null, and the page says the link is broken. */
export function parseGenerateParam(param: string): GenerationScope | null {
  const parsed = scopeSchema.safeParse(generateParam.decode(param));
  return parsed.success ? (parsed.data as GenerationScope) : null;
}
