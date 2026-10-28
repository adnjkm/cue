import type { QuestionId } from "../ids";
import type { SourceRef } from "../sources";

/** A row exists or it doesn't; loading and errors live in memory. */
export interface Solution {
  questionId: QuestionId;
  answer: string;
  explanation: string;
  steps: readonly { label: string; text: string }[];
  conclusion?: string;
  whyNot: Readonly<Record<string, string>>;
  resources: readonly SourceRef[];
  provenance: { by: "document" | "model"; groundedIn?: SourceRef };
}
