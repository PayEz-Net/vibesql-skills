const TABLE_NAME_RE = /^[A-Za-z0-9_]+$/;
export class VibeClient {
    baseUrl;
    secret;
    constructor(baseUrl, secret) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.secret = secret;
    }
    async health() {
        const res = await fetch(`${this.baseUrl}/v1/health`);
        if (!res.ok) {
            throw new Error(`Health check failed: ${res.status} ${res.statusText}`);
        }
        return res.json();
    }
    async query(sql, params) {
        const body = { sql };
        if (params && params.length > 0) {
            body.params = params;
        }
        const headers = { 'Content-Type': 'application/json' };
        if (this.secret) {
            headers['Authorization'] = `Secret ${this.secret}`;
        }
        const res = await fetch(`${this.baseUrl}/v1/query`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Query failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
        }
        const api = (await res.json());
        if (!api.success && api.error) {
            throw new Error(`${api.error.code}: ${api.error.message}${api.error.detail ? ` — ${api.error.detail}` : ''}`);
        }
        // Transform API response (array of objects) to columnar format (columns + rows of arrays)
        // vibesql-micro returns "rows", vibesql-server returns "data"
        const apiRows = api.data ?? api.rows ?? [];
        const resolvedRowCount = api.rowCount ?? api.meta?.rowCount ?? api.meta?.row_count ?? 0;
        if (apiRows.length === 0) {
            return { columns: [], rows: [], rowCount: resolvedRowCount };
        }
        const columns = Object.keys(apiRows[0]);
        const rows = apiRows.map((row) => columns.map((col) => row[col]));
        return { columns, rows, rowCount: resolvedRowCount || rows.length };
    }
    async listTables() {
        return this.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    }
    async describeTable(table) {
        validateName(table, 'table');
        return this.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
    }
    async tableData(table, limit, offset) {
        validateName(table, 'table');
        return this.query(`SELECT * FROM "${table}" LIMIT $1 OFFSET $2`, [limit, offset]);
    }
    async insertRow(table, data) {
        validateName(table, 'table');
        const entries = Object.entries(data);
        if (entries.length === 0) {
            throw new Error('insert_row: data object must have at least one column');
        }
        for (const [col] of entries) {
            validateName(col, 'column');
        }
        const columns = entries.map(([col]) => `"${col}"`).join(', ');
        const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
        const values = entries.map(([, val]) => val);
        return this.query(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`, values);
    }
    async createTable(sql) {
        if (!/^CREATE\s+TABLE\b/i.test(sql)) {
            throw new Error('create_table: SQL must start with CREATE TABLE');
        }
        if (sql.includes(';')) {
            throw new Error('create_table: semicolons are not allowed (prevents multi-statement injection)');
        }
        return this.query(sql);
    }
    async alterTable(sql) {
        if (!/^ALTER\s+TABLE\b/i.test(sql)) {
            throw new Error('alter_table: SQL must start with ALTER TABLE');
        }
        if (sql.includes(';')) {
            throw new Error('alter_table: semicolons are not allowed (prevents multi-statement injection)');
        }
        return this.query(sql);
    }
    async getRowCount(table) {
        validateName(table, 'table');
        const result = await this.query(`SELECT COUNT(*) AS cnt FROM "${table}"`);
        if (result.rows.length === 0)
            return 0;
        return Number(result.rows[0][0]) || 0;
    }
    async getConstraints(table) {
        validateName(table, 'table');
        return this.query(`SELECT
         tc.constraint_name,
         tc.constraint_type,
         kcu.column_name,
         ccu.table_name AS foreign_table,
         ccu.column_name AS foreign_column
       FROM information_schema.table_constraints tc
       LEFT JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       LEFT JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
         AND tc.constraint_type = 'FOREIGN KEY'
       WHERE tc.table_schema = 'public' AND tc.table_name = $1
       ORDER BY tc.constraint_type, tc.constraint_name`, [table]);
    }
    async getIndexes(table) {
        validateName(table, 'table');
        return this.query(`SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1
       ORDER BY indexname`, [table]);
    }
    async getDependents(table) {
        validateName(table, 'table');
        return this.query(`SELECT
         tc.table_name AS referencing_table,
         kcu.column_name AS referencing_column,
         tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_schema = 'public'
         AND ccu.table_name = $1
       ORDER BY tc.table_name`, [table]);
    }
    /**
     * Classify a DDL statement by its risk level.
     * Returns: 'safe' | 'migration' | 'destructive' | 'prohibited'
     */
    classifyDdl(sql) {
        const upper = sql.toUpperCase().trim();
        // Prohibited
        if (/^DROP\s+SCHEMA\b/i.test(sql))
            return { level: 'prohibited', code: 'P-400', reason: 'DROP SCHEMA is catastrophic' };
        if (/^TRUNCATE\b/i.test(sql))
            return { level: 'destructive', code: 'D-300', reason: 'TRUNCATE removes all data' };
        // Destructive
        if (/^DROP\s+TABLE\b/i.test(sql))
            return { level: 'destructive', code: 'D-300', reason: 'Dropping a table may lose data' };
        if (/ALTER\s+TABLE\b.*\bDROP\s+COLUMN\b/i.test(sql))
            return { level: 'destructive', code: 'D-301', reason: 'Dropping a column may lose data' };
        if (/ALTER\s+TABLE\b.*\bDROP\s+CONSTRAINT\b/i.test(sql))
            return { level: 'destructive', code: 'D-308', reason: 'Dropping a constraint removes integrity guarantee' };
        if (/ALTER\s+TABLE\b.*\bALTER\s+COLUMN\b.*\bTYPE\b/i.test(sql))
            return { level: 'destructive', code: 'D-303', reason: 'Changing column type may lose or corrupt data' };
        if (/ALTER\s+TABLE\b.*\bRENAME\b/i.test(sql))
            return { level: 'destructive', code: 'D-305', reason: 'Renaming breaks queries that reference the old name' };
        // Migration
        if (/ALTER\s+TABLE\b.*\bSET\s+NOT\s+NULL\b/i.test(sql))
            return { level: 'migration', code: 'M-203', reason: 'Setting NOT NULL may fail if NULLs exist' };
        if (/ALTER\s+TABLE\b.*\bADD\s+COLUMN\b.*\bNOT\s+NULL\b/i.test(sql) && /\bDEFAULT\b/i.test(sql))
            return { level: 'migration', code: 'M-200', reason: 'Adding non-null column with default — safe but requires backfill' };
        if (/CREATE\s+UNIQUE\s+INDEX\b/i.test(sql))
            return { level: 'migration', code: 'M-202', reason: 'Unique index may fail if duplicates exist' };
        // Safe
        if (/^CREATE\s+TABLE\b/i.test(sql))
            return { level: 'safe', code: 'S-100', reason: 'Creating a new table' };
        if (/ALTER\s+TABLE\b.*\bADD\s+COLUMN\b/i.test(sql))
            return { level: 'safe', code: 'S-101', reason: 'Adding a nullable column' };
        if (/^CREATE\s+INDEX\b/i.test(sql))
            return { level: 'safe', code: 'S-106', reason: 'Creating an index' };
        return { level: 'unknown', code: '—', reason: 'Could not classify — review manually' };
    }
}
function validateName(name, kind) {
    if (!TABLE_NAME_RE.test(name)) {
        throw new Error(`Invalid ${kind} name "${name}" — only alphanumeric characters and underscores are allowed`);
    }
}
