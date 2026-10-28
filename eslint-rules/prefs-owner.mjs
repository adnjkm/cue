// cue/prefs-owner: in features/<x>/**, setPrefs takes the literal "<x>" as its first argument.
const rule = {
  meta: {
    type: "problem",
    docs: { description: "A feature writes only its own prefs slice" },
    schema: [{ type: "object", properties: { owner: { type: "string" } }, additionalProperties: false }],
    messages: { slice: 'Pass the literal "{{owner}}": features/{{owner}} may only write its own prefs slice.' },
  },
  create(context) {
    const { owner } = context.options[0] ?? {};
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "setPrefs") return;
        const first = node.arguments[0];
        if (!first || first.type !== "Literal" || first.value !== owner) context.report({ node, messageId: "slice", data: { owner } });
      },
    };
  },
};

export default rule;
