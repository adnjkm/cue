/**
 * Extracts the JSON object from model text, tolerating code fences and reasoning preambles.
 * The outermost braces go first: question prompts carry their own ``` fences inside JSON strings.
 */
export function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  let error: unknown = new Error("Model response contained no JSON object");
  for (const body of fenced === undefined ? [content] : [content, fenced]) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch (e) {
      error = e;
    }
  }
  throw error;
}

/**
 * Incremental parser for `{"items": [ … ]}`: feed it text as it streams and it returns each array element
 * the moment its closing bracket arrives, so list tasks can forward items before the model finishes.
 */
export class ItemSplitter {
  private text = "";
  private pos = 0;
  private inArray = false;
  private done = false;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private itemStart = -1;

  push(chunk: string): string[] {
    this.text += chunk;
    const out: string[] = [];
    while (!this.done && this.pos < this.text.length) {
      if (!this.inArray) {
        const m = /"items"\s*:\s*\[/.exec(this.text.slice(this.pos));
        if (!m) {
          this.pos = Math.max(this.pos, this.text.length - 16);
          break;
        }
        this.pos += m.index + m[0].length;
        this.inArray = true;
        continue;
      }
      const c = this.text[this.pos];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === "\\") this.escaped = true;
        else if (c === '"') this.inString = false;
      } else if (c === '"') {
        this.inString = true;
        if (this.depth === 0 && this.itemStart < 0) this.itemStart = this.pos;
      } else if (c === "{" || c === "[") {
        if (this.depth === 0) this.itemStart = this.pos;
        this.depth++;
      } else if (c === "}" || c === "]") {
        if (this.depth === 0 && c === "]") {
          this.flushScalar(out);
          this.done = true;
        } else {
          this.depth--;
          if (this.depth === 0 && this.itemStart >= 0) {
            out.push(this.text.slice(this.itemStart, this.pos + 1));
            this.itemStart = -1;
          }
        }
      } else if (c === "," && this.depth === 0) {
        this.flushScalar(out);
      } else if (this.depth === 0 && this.itemStart < 0 && !/\s/.test(c)) {
        this.itemStart = this.pos;
      }
      this.pos++;
    }
    return out;
  }

  private flushScalar(out: string[]) {
    if (this.itemStart >= 0 && this.depth === 0) {
      const raw = this.text.slice(this.itemStart, this.pos).trim();
      if (raw) out.push(raw);
      this.itemStart = -1;
    }
  }
}
