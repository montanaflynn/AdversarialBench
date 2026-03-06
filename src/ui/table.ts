export function renderTable(input: { header: string[]; rows: string[][] }): string[] {
  const widths = input.header.map((cell, index) => {
    const rowWidths = input.rows.map((row) => row[index]?.length ?? 0);
    return Math.max(cell.length, ...rowWidths);
  });

  const formatRow = (cells: string[]): string =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join(" | ")} |`;

  const separator = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;

  return [separator, formatRow(input.header), separator, ...input.rows.map(formatRow), separator];
}
