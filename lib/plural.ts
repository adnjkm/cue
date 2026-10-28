/** "1 course", "3 courses". Pass `many` for a noun that does not just add an s. The one place a count meets its noun. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
