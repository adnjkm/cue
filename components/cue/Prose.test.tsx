import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Prose } from "./Prose";

const html = (text: string) => renderToStaticMarkup(<Prose text={text} />);

describe("Prose", () => {
  it("renders a block of dashes or asterisks as a bulleted list", () => {
    const out = html("- first\n- second with **bold**");
    expect(out).toContain("<ul");
    expect(out).toContain("<li>first</li>");
    expect(out).toContain("<li>second with <strong>bold</strong></li>");
  });

  it("renders a block of numbered lines as an ordered list", () => {
    const out = html("1. one\n2) two");
    expect(out).toContain("<ol");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<li>two</li>");
  });

  it("keeps a mixed block, and a plain one, as paragraphs", () => {
    expect(html("- one\ntext")).not.toContain("<ul");
    expect(html("just a line")).toContain("<p");
    expect(html("a\n\nb").match(/<p/g)).toHaveLength(2);
  });
});
