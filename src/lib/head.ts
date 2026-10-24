/** First letter or digit of a name, upper case. */
export function monogramLetter(name: string): string {
  const match = name.match(/[\p{L}\p{N}]/u);
  return (match ? match[0] : name.trim().charAt(0) || "?").toLocaleUpperCase("en");
}
