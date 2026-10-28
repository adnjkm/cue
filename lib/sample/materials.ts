import type { CourseId, EpochMs, EventId, Material, MaterialId, MaterialKind, MaterialPage, SlideContent } from "@/lib/domain";
import type { SampleContext } from "./context";
import { SAMPLE } from "./ids";

const { csc148: CSC, mat137: MAT, eco101: ECO } = SAMPLE.courses;

type PageSpec = { text?: string; slide?: SlideContent; label?: string; section?: string };

interface MaterialSpec {
  id: MaterialId;
  courseId: CourseId;
  kind: MaterialKind;
  title: string;
  short?: string;
  lecture?: { number: number; eventId?: EventId };
  /** Week and weekday it was added, relative to the Paper week. */
  added: [week: number, day: 1 | 2 | 3 | 4 | 5 | 6 | 7];
  pages: PageSpec[];
}

const PREORDER = `def preorder(self) -> list:
    if self.is_empty():        # base case
        return []
    items = [self._root]
    for subtree in self._subtrees:
        items.extend(subtree.preorder())
    return items`;

const POSTORDER = `def postorder(self) -> list:
    if self.is_empty():
        return []
    items = []
    for subtree in self._subtrees:
        items.extend(subtree.postorder())
    items.append(self._root)
    return items`;

const s = (heading: string, body: string, code?: string): PageSpec => ({ slide: { heading, body, ...(code ? { code: { lang: "python", text: code } } : {}) } });

const CSC148_L8_SLIDES: PageSpec[] = [
  s("Lecture 8: Recursion & tree traversal", "CSC148 · Prof. Liu"),
  s("Where we are", "Last week: recursive lists. Today: trees, the most recursive structure in the course."),
  s("Recap: trees", "A tree is either empty, or a root value with zero or more subtrees, each of which is a tree."),
  s("Tree terminology", "Root, leaf, internal node, parent, child, height. A leaf has no children."),
  s("The Tree class", "Attributes _root and _subtrees. An empty tree has _root None and no subtrees."),
  s("is_empty", "Every recursive Tree method starts by asking whether the tree is empty.", "def is_empty(self) -> bool:\n    return self._root is None"),
  s("Recursive structure", "A method on a tree combines the results of the same method on each subtree."),
  s("Size of a tree", "The size is 1 for the root plus the sizes of all the subtrees.", "def __len__(self) -> int:\n    if self.is_empty():\n        return 0\n    return 1 + sum(len(t) for t in self._subtrees)"),
  s("Base case first", "Check the empty tree before touching _root. Skipping it means every leaf recurses into nothing."),
  s("Tracing size()", "Trace len() on a tree with root A and children B and C: 1 + len(B) + len(C) = 3."),
  s("Traversals", "A traversal visits every node exactly once. The order is what changes."),
  s("Traversal orders", "Preorder, inorder (binary trees only) and postorder differ only in when the root is visited."),
  s("Visiting a node", "To visit a node is to do the work: print it, collect it, or delete it."),
  s("Preorder traversal", "Visit the root first, then recurse on each subtree, left to right.", PREORDER),
  s("Preorder on our example", "For root A with subtrees B (children D, E) and C: A, B, D, E, C."),
  s("Inorder traversal", "Left subtree, then the root, then the right subtree. Only defined for binary trees: D, B, E, A, C."),
  s("Postorder traversal", "Recurse on each subtree first, then visit the root: D, E, B, C, A. Use it when children must be handled before their parent, like deleting a tree.", POSTORDER),
  s("Postorder is not reversed preorder", "Reversing preorder gives C, E, D, B, A. The root comes last, but the children are flipped too."),
  s("Level order", "Visit nodes depth by depth with a queue. Not recursive."),
  s("Comparing orders", "Preorder: root first. Inorder: root in the middle. Postorder: root last."),
  s("Deleting a subtree", "To delete a subtree safely, delete its children before the node itself: a postorder walk."),
  s("Why postorder for deletion", "If you delete the parent first, nothing points into its children any more and they are lost."),
  s("Exercise", "Write a method that returns the leaves of a tree, left to right."),
  s("Binary trees", "Each node has at most two children, left and right. Inorder traversal needs exactly this."),
  s("Binary search trees", "Every value in the left subtree is smaller than the root, every value on the right is larger."),
  s("Searching a BST", "Compare with the root and recurse into one side only."),
  s("Height and running time", "Searching a BST of height h takes O(h) steps; a balanced tree has h about log n."),
  s("Unbalanced trees", "Inserting sorted values builds a chain, so search becomes O(n)."),
  s("Common mistakes", "Forgetting the empty-tree check. Recursing on _root instead of the subtrees."),
  s("Practice", "Lab 6 has traversal exercises. Assignment 2 asks you to delete subtrees from a TreeMap."),
  s("Summary", "Trees are recursive. Check the base case first. Pick the traversal order the task needs."),
  s("Next time", "Recursion on binary search trees: insertion and deletion."),
];

const SPECS: MaterialSpec[] = [
  {
    id: SAMPLE.materials.csc148L8Slides,
    courseId: CSC,
    kind: "slides",
    title: "Lecture 8 slides",
    lecture: { number: 8, eventId: SAMPLE.events.csc148Lecture8 },
    added: [0, 1],
    pages: CSC148_L8_SLIDES,
  },
  {
    id: SAMPLE.materials.csc148Lab6,
    courseId: CSC,
    kind: "handout",
    title: "Lab 6 handout",
    short: "Lab 6 handout",
    lecture: { number: 8, eventId: SAMPLE.events.csc148Lecture8 },
    added: [0, 1],
    pages: [
      { section: "§1", text: "Lab 6: tree traversals.\n\nIn this lab you write preorder, postorder and level-order traversals for the Tree class from lecture." },
      { section: "§2", text: "Exercise 1. Implement Tree.preorder and test it on the example tree from Lecture 8.\n\nExercise 2. Implement Tree.postorder. Explain why it is not the reverse of preorder." },
    ],
  },
  {
    id: SAMPLE.materials.csc148A2Handout,
    courseId: CSC,
    kind: "handout",
    title: "A2 handout",
    short: "A2 handout",
    added: [-2, 3],
    pages: [
      { section: "§1", text: "Assignment 2: TreeMap.\n\nYou will implement a TreeMap that stores a folder hierarchy as a tree." },
      { section: "§2", text: "The TreeMap class.\n\nEach node stores a name, a size and its subtrees. The size of a folder is the sum of the sizes of its subtrees." },
      {
        section: "§3",
        text: "Deleting subtrees.\n\nTreeMap.delete_subtree(name) removes a folder and everything below it. Delete the children before the parent: walk the subtree in postorder so no node is removed while something still points into it.",
      },
    ],
  },
  {
    id: SAMPLE.materials.csc148Notes,
    courseId: CSC,
    kind: "notes",
    title: "Course notes",
    added: [-4, 1],
    pages: [
      { section: "§5.1", label: "p. 61", text: "Trees.\n\nA tree is a recursive structure: a root value and a list of subtrees." },
      { section: "§5.2", label: "p. 63", text: "Recursion on trees.\n\nMost tree methods check whether the tree is empty, then combine results from each subtree." },
      {
        section: "§5.3",
        label: "p. 66",
        text: "Tree traversals.\n\nA preorder traversal visits the root before its subtrees. A postorder traversal visits the root after all of its subtrees. Postorder is the order to use when deleting a tree.",
      },
    ],
  },
  {
    id: SAMPLE.materials.eco101Textbook,
    courseId: ECO,
    kind: "textbook",
    title: "Textbook",
    added: [-4, 1],
    pages: [
      { section: "§5.1", label: "p. 92", text: "Price elasticity of demand.\n\nThe price elasticity of demand measures how much the quantity demanded responds to a change in price. Demand is elastic when the quantity responds strongly and inelastic when it responds only slightly." },
      { section: "§5.1", label: "p. 93", text: "Computing elasticity.\n\nElasticity equals the percentage change in quantity demanded divided by the percentage change in price. The midpoint method gives the same answer whichever direction the price moves." },
      { section: "§5.1", label: "p. 94", text: "Figure 5-1 shows two demand curves.\n\nOn the flatter curve a small price rise cuts the quantity sharply. On the steeper curve the quantity barely moves." },
      { section: "§5.2", label: "p. 98", text: "Elasticity and total revenue.\n\nWhen demand is inelastic, a price rise increases total revenue. When demand is elastic, it reduces total revenue." },
    ],
  },
  {
    id: SAMPLE.materials.eco101L7Slides,
    courseId: ECO,
    kind: "slides",
    title: "Lecture 7 slides",
    lecture: { number: 7, eventId: SAMPLE.events.eco101Lecture7 },
    added: [-1, 3],
    pages: [
      s("Lecture 7: Elasticity", "ECO101 · Prof. Okafor"),
      s("How much do buyers react?", "Elasticity measures the responsiveness of quantity to price."),
      s("Two goods, one price rise", "Restaurant meals versus gasoline."),
      s("Elastic or inelastic", "Many substitutes make demand elastic. Necessities make it inelastic."),
      s("Time horizon", "Demand is more elastic in the long run."),
      s("The formula", "Price elasticity of demand = % change in quantity demanded ÷ % change in price."),
      s("Reading the number", "Above 1 is elastic, below 1 is inelastic, exactly 1 is unit elastic."),
      s("The midpoint method", "Divide each change by the average of the start and end values, so rises and falls agree."),
      s("Slope is not elasticity", "A straight demand line has one slope but its elasticity changes along the line."),
    ],
  },
  {
    id: SAMPLE.materials.eco101Ps4,
    courseId: ECO,
    kind: "problemSet",
    title: "Problem Set 4",
    short: "PS4",
    added: [-1, 4],
    pages: [
      { label: "Q1", text: "Q1. The price of concert tickets rises from $40 to $60 and sales fall from 1,000 to 600. Use the midpoint method to compute the price elasticity of demand." },
      { label: "Q2", text: "Q2. A demand curve is a straight line. Is demand more elastic at the top of the line or at the bottom? Explain." },
    ],
  },
  {
    id: "mat_sample_mat137_text" as MaterialId,
    courseId: MAT,
    kind: "textbook",
    title: "Textbook",
    added: [-4, 2],
    pages: [{ section: "§7.1", label: "p. 482", text: "Integration by parts.\n\n∫ u dv = uv − ∫ v du. Choose u by LIATE: logarithmic, inverse trigonometric, algebraic, trigonometric, exponential." }],
  },
  {
    id: "mat_sample_mat137_l09_slides" as MaterialId,
    courseId: MAT,
    kind: "slides",
    title: "Lecture 9 slides",
    lecture: { number: 9 },
    added: [0, 2],
    pages: [
      s("Integration by parts", "MAT137 · Prof. Chen"),
      s("Where it comes from", "The product rule, run backwards."),
      s("The product rule", "(uv)′ = u′v + uv′"),
      s("Deriving the formula", "Integrate both sides of the product rule."),
      s("Rearranging", "∫ u dv = uv − ∫ v du"),
      s("The formula", "∫ u dv = uv − ∫ v du. Pick u so that du is simpler than u."),
      s("Choosing u", "LIATE: logarithmic, inverse trig, algebraic, trig, exponential."),
      s("Example", "∫ x eˣ dx: u = x, dv = eˣ dx."),
      s("Checking", "Differentiate your answer to check it."),
    ],
  },
  {
    id: "mat_sample_mat137_ps5" as MaterialId,
    courseId: MAT,
    kind: "problemSet",
    title: "Problem Set 5",
    short: "PS5",
    added: [-1, 4],
    pages: [{ label: "Q3–Q6", text: "Q3 to Q6. Evaluate each integral using integration by parts. Check each answer by differentiating." }],
  },
];

export function sampleMaterials(ctx: SampleContext): { materials: Material[]; pages: MaterialPage[] } {
  const materials: Material[] = [];
  const pages: MaterialPage[] = [];
  for (const spec of SPECS) {
    materials.push({
      id: spec.id,
      courseId: spec.courseId,
      kind: spec.kind,
      title: spec.title,
      ...(spec.short ? { short: spec.short } : {}),
      ...(spec.lecture ? { lecture: spec.lecture } : {}),
      pageCount: spec.pages.length,
      addedAt: ctx.at(spec.added[1], "08:00", spec.added[0]) as EpochMs,
    });
    spec.pages.forEach((p, i) =>
      pages.push({
        materialId: spec.id,
        index: i + 1,
        text: p.text ?? [p.slide?.heading, p.slide?.body, p.slide?.code?.text].filter(Boolean).join("\n"),
        ...(p.slide ? { slide: p.slide } : {}),
        ...(p.label ? { label: p.label } : {}),
        ...(p.section ? { section: p.section } : {}),
        readBy: "sample",
      }),
    );
  }
  return { materials, pages };
}
