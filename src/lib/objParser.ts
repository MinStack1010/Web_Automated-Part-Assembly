/** Parse OBJ file text to extract declared object names (`o` declarations). */

export function parseObjectNames(objText: string): string[] {
  const names: string[] = [];
  const lines = objText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("o ") || trimmed.startsWith("o\t")) {
      const name = trimmed.slice(1).trim();
      if (name) names.push(name);
    }
  }
  return names;
}

export async function extractObjectNamesFromFile(file: File): Promise<string[]> {
  const text = await file.text();
  return parseObjectNames(text);
}
