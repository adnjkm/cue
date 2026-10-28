// cue/table-writers: a write on db.<table> from a file whose workstream does not write that table is an error.
const WRITES = new Set(["put", "add", "update", "delete", "bulkPut", "bulkAdd", "bulkUpdate", "bulkDelete", "clear", "modify"]);

const name = (member) => (member.computed ? (member.property.type === "Literal" ? String(member.property.value) : null) : member.property.name);

/** Walks a call chain like db.attempts.where("x").equals(y).modify(f) back to "attempts". */
function rootTable(node) {
  let n = node;
  for (;;) {
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression") n = n.callee.object;
    else if (n.type === "MemberExpression") {
      if (n.object.type === "Identifier" && n.object.name === "db") return name(n);
      n = n.object;
    } else if (n.type === "ChainExpression") n = n.expression;
    else return null;
  }
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Only a table's writer workstream may call write methods on it" },
    schema: [{ type: "object", properties: { owner: { type: "string" }, tableWriters: { type: "object" } }, additionalProperties: false }],
    messages: {
      foreign: "{{owner}} may not write `{{table}}` (its writer is {{writer}}). Call the owning module's actions instead.",
      dynamic: "db.table() is only allowed inside lib/db. Use db.<table> so the writer can be checked.",
    },
  },
  create(context) {
    const { owner, tableWriters } = context.options[0] ?? {};
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (callee.object.type === "Identifier" && callee.object.name === "db" && name(callee) === "table") {
          context.report({ node, messageId: "dynamic" });
          return;
        }
        if (!WRITES.has(name(callee) ?? "")) return;
        const table = rootTable(callee.object);
        if (!table || !(table in tableWriters)) return;
        if (tableWriters[table] !== owner) context.report({ node, messageId: "foreign", data: { owner, table, writer: tableWriters[table] } });
      },
    };
  },
};

export default rule;
