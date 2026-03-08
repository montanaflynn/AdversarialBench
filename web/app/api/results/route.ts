import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { resolve } from "path";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const DB_PATH =
  process.env.AB_DB_PATH ??
  resolve(process.cwd(), "../data/adversarialbench.db");

const TABLES_TO_MERGE = [
  "runs",
  "run_models",
  "matrix_results",
  "matrix_attempts",
] as const;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = process.env.BENCHMARK_API_KEY;

  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }

  const tmpPath = resolve(tmpdir(), `bench-import-${randomUUID()}.db`);

  try {
    writeFileSync(tmpPath, Buffer.from(body));

    // Validate the uploaded file is a real SQLite DB
    const srcDb = new Database(tmpPath, { readonly: true });
    const srcTables = srcDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('runs','run_models','matrix_results','matrix_attempts')"
      )
      .all() as Array<{ name: string }>;
    srcDb.close();

    if (srcTables.length === 0) {
      return NextResponse.json(
        { error: "no benchmark tables found in uploaded DB" },
        { status: 400 }
      );
    }

    // Open production DB as writable and merge
    mkdirSync(resolve(DB_PATH, ".."), { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");

    db.exec(`ATTACH DATABASE '${tmpPath}' AS src`);

    let imported = 0;
    const merge = db.transaction(() => {
      for (const table of TABLES_TO_MERGE) {
        if (!srcTables.some((t) => t.name === table)) continue;

        const cols = db
          .prepare(`PRAGMA table_info(${table})`)
          .all() as Array<{ name: string }>;
        const colNames = cols.map((c) => c.name).join(", ");

        const result = db
          .prepare(
            `INSERT OR IGNORE INTO ${table} (${colNames}) SELECT ${colNames} FROM src.${table}`
          )
          .run();
        imported += result.changes;
      }
    });
    merge();

    db.exec("DETACH DATABASE src");
    db.close();

    return NextResponse.json({ ok: true, imported });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "import failed" },
      { status: 500 }
    );
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {}
  }
}
