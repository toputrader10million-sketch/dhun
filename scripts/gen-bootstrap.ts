/**
 * Q1.1 — schema-driven lazy-bootstrap DDL generator.
 *
 * Parses prisma/schema.prisma and emits src/lib/db-bootstrap.generated.ts —
 * the full idempotent SQLite DDL (CREATE TABLE IF NOT EXISTS + indexes) for
 * EVERY model. The hand-curated list in db-bootstrap.ts was the root cause of
 * the Day 58 production 500 (QueueHandoff forgotten). Generated code removes
 * that entire bug class: adding a model to schema.prisma and running
 * `bun run bootstrap:gen` can never leave a table out of the lazy bootstrap.
 *
 * Run: bun run bootstrap:gen   (commit the generated file)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SCHEMA_PATH = join(ROOT, 'prisma', 'schema.prisma')
const OUT_PATH = join(ROOT, 'src', 'lib', 'db-bootstrap.generated.ts')

const SQL_TYPE: Record<string, string> = {
  String: 'TEXT',
  Int: 'INTEGER',
  BigInt: 'BIGINT',
  Float: 'REAL',
  Decimal: 'REAL',
  Boolean: 'BOOLEAN',
  DateTime: 'DATETIME',
  Json: 'TEXT',
  Bytes: 'BLOB',
}

const FK_ACTION: Record<string, string> = {
  Cascade: 'CASCADE',
  SetNull: 'SET NULL',
  Restrict: 'RESTRICT',
  NoAction: 'NO ACTION',
}

interface Field {
  name: string
  type: string
  list: boolean
  optional: boolean
  attrs: string
}

interface Model {
  name: string
  fields: Field[]
}

function parseModels(src: string): Model[] {
  const models: Model[] = []
  const modelRe = /model\s+(\w+)\s*\{([^}]*)\}/g
  for (const m of src.matchAll(modelRe)) {
    const name = m[1]
    const fields: Field[] = []
    for (const rawLine of m[2].split('\n')) {
      let line = rawLine.trim()
      if (!line || line.startsWith('//')) continue
      // strip trailing inline comments defensively
      const cIdx = line.indexOf(' //')
      if (cIdx >= 0) line = line.slice(0, cIdx).trim()
      if (line.startsWith('@@')) continue // model-level attributes handled below
      // Prisma fields are "name Type [attrs…]" — attrs are OPTIONAL
      // (e.g. `trackId String` has none and must still become a column).
      const tokens = line.split(/\s+/)
      if (tokens.length < 2) continue
      const name = tokens[0]
      const typeTok = tokens[1]
      const attrs = tokens.slice(2).join(' ')
      let type = typeTok
      let list = false
      if (type.endsWith('[]')) {
        list = true
        type = type.slice(0, -2)
      } else if (type.endsWith('[]?') || type.endsWith('?[]')) {
        list = true
        type = type.slice(0, -3)
      } else if (type.endsWith('?')) {
        type = type.slice(0, -1)
      }
      // strip trailing '?' defensively
      type = type.replace(/\?$/, '')
      fields.push({ name, type, list, optional: typeTok.includes('?'), attrs })
    }
    models.push({ name, fields })
  }
  return models
}

function extract(attrBlock: string, name: string): string | null {
  const re = new RegExp(`@${name}\\(([^)]*)\\)`)
  const m = attrBlock.match(re)
  return m ? m[1] : null
}

function modelNames(models: Model[]): Set<string> {
  return new Set(models.map((m) => m.name))
}

function quoteDefault(value: string, type: string): string | null {
  const v = value.trim()
  if (v.startsWith('"') && v.endsWith('"')) {
    return `'${v.slice(1, -1).replace(/'/g, "''")}'`
  }
  if (v === 'true' || v === 'false') return v
  if (/^-?\d+(\.\d+)?$/.test(v)) return v
  if (v === 'now()' && type === 'DateTime') return 'CURRENT_TIMESTAMP'
  // cuid()/uuid() are client-side generated — no DDL default. @updatedAt is
  // client-managed — no DDL default either.
  return null
}

function buildDDL(models: Model[]): string[] {
  const known = modelNames(models)
  const statements: string[] = []

  for (const model of models) {
    const cols: string[] = []
    const fks: string[] = []
    const uniqueCols: string[] = []
    const attrOnly: string[] = [] // @@unique / @@index collected below

    // relation scalar fields: from @relation(fields: [x])
    const fkScalars = new Map<string, { refTable: string; refColumn: string; onDelete: string | null }>()
    for (const f of model.fields) {
      if (!known.has(f.type) || !f.attrs.includes('@relation')) continue
      const fieldsAttr = extract(f.attrs, 'relation')
      const fm = fieldsAttr?.match(/fields:\s*\[([^\]]+)\]/)
      const rm = fieldsAttr?.match(/references:\s*\[([^\]]+)\]/)
      if (!fm || !rm) continue
      const scalar = fm[1].trim()
      const dm = fieldsAttr?.match(/onDelete:\s*(\w+)/)
      fkScalars.set(scalar, { refTable: f.type, refColumn: rm[1].trim(), onDelete: dm ? dm[1] : null })
    }

    for (const f of model.fields) {
      // skip list fields and relation object fields
      if (f.list || (known.has(f.type) && f.attrs.includes('@relation'))) continue

      const sqlType = SQL_TYPE[f.type]
      if (!sqlType) throw new Error(`Unknown Prisma type "${f.type}" on ${model.name}.${f.name}`)

      const isId = f.attrs.includes('@id')
      const isUnique = f.attrs.includes('@unique') && !isId
      if (isUnique) uniqueCols.push(f.name)

      let col = `"${f.name}" ${sqlType}`
      if (isId) {
        col += ' NOT NULL PRIMARY KEY'
      } else {
        col += f.optional ? '' : ' NOT NULL'
        const def = extract(f.attrs, 'default')
        if (def !== null) {
          const ddlDefault = quoteDefault(def, f.type)
          if (ddlDefault !== null) col += ` DEFAULT ${ddlDefault}`
        }
      }
      cols.push(col)

      const fk = fkScalars.get(f.name)
      if (fk) {
        const action = fk.onDelete ? ` ON DELETE ${FK_ACTION[fk.onDelete] ?? 'NO ACTION'}` : ''
        fks.push(
          `FOREIGN KEY ("${f.name}") REFERENCES "${fk.refTable}" ("${fk.refColumn}")${action} ON UPDATE CASCADE`
        )
      }
    }

    // model-level attributes live on non-field lines; re-scan raw model block
    const blockRe = new RegExp(`model\\s+${model.name}\\s*\\{([\\s\\S]*?)\\}`)
    const block = src.match(blockRe)?.[1] ?? ''
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim()
      if (!line.startsWith('@@')) continue
      const um = line.match(/@@unique\(\[([^\]]+)\]\)/)
      if (um) {
        const colsU = um[1].split(',').map((c) => c.trim()).filter(Boolean)
        attrOnly.push(
          `CREATE UNIQUE INDEX IF NOT EXISTS "${model.name}_${colsU.join('_')}_key" ON "${model.name}"(${colsU.map((c) => `"${c}"`).join(', ')})`
        )
        continue
      }
      const im = line.match(/@@index\(\[([^\]]+)\]\)/)
      if (im) {
        const colsI = im[1].split(',').map((c) => c.trim()).filter(Boolean)
        attrOnly.push(
          `CREATE INDEX IF NOT EXISTS "${model.name}_${colsI.join('_')}_idx" ON "${model.name}"(${colsI.map((c) => `"${c}"`).join(', ')})`
        )
      }
    }

    const tableDDL = `CREATE TABLE IF NOT EXISTS "${model.name}" (\n  ${[...cols, ...fks].join(',\n  ')}\n)`
    statements.push(tableDDL)
    for (const c of uniqueCols) {
      statements.push(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${model.name}_${c}_key" ON "${model.name}"("${c}")`
      )
    }
    statements.push(...attrOnly)
  }
  return statements
}

const src = readFileSync(SCHEMA_PATH, 'utf8')
const models = parseModels(src)
if (models.length === 0) throw new Error('No models parsed from schema.prisma — aborting')
const ddl = buildDDL(models)

const banner = `/**
 * AUTO-GENERATED by scripts/gen-bootstrap.ts — DO NOT EDIT BY HAND.
 * Source of truth: prisma/schema.prisma (${models.length} models, ${ddl.length} DDL statements).
 * Regenerate after any schema change:  bun run bootstrap:gen
 *
 * Q1.1 — this file replaces the hand-curated DDL list whose omission of
 * QueueHandoff caused the Day 58 production 500. Every model in the schema
 * is now guaranteed a self-healing CREATE IF NOT EXISTS in the lazy bootstrap.
 */
export const GENERATED_DDL: string[] = [
`

const body = ddl.map((s) => `  ${JSON.stringify(s)},`).join('\n')
writeFileSync(OUT_PATH, `${banner}${body}\n]\n`)

console.log(`[gen-bootstrap] parsed ${models.length} models → ${ddl.length} DDL statements`)
console.log(`[gen-bootstrap] wrote ${OUT_PATH}`)
for (const model of models) console.log(`  - ${model.name}`)
