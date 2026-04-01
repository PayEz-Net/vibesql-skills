import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VibeClient } from './client.js';
import { getHelp, HELP_TOPICS } from './help.js';

// --- CLI args ---

function parseArgs(): { url: string; secret?: string } {
  const args = process.argv.slice(2);
  let url: string | undefined;
  let secret: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      url = args[++i]!;
    } else if (args[i] === '--secret' && args[i + 1]) {
      secret = args[++i]!;
    }
  }
  return {
    url: url || process.env['VIBESQL_URL'] || 'http://localhost:5173',
    secret: secret || process.env['VIBESQL_SECRET'] || undefined,
  };
}

const { url: baseUrl, secret } = parseArgs();
const client = new VibeClient(baseUrl, secret);

// --- Startup logging (stderr — visible to host, not on MCP stdio) ---

function log(msg: string): void {
  process.stderr.write(`[vibesql-mcp] ${msg}\n`);
}

log(`v1.1.0 starting — target: ${baseUrl}`);

// Probe vibesql-micro (non-blocking, informational only — never exit on failure)
client.health()
  .then(() => log('vibesql-micro is reachable'))
  .catch(() => log('vibesql-micro not reachable yet — tools will retry on each call'));

// --- MCP Server ---

const server = new McpServer({
  name: 'vibesql-mcp',
  version: '1.1.0',
});

// ---------------------------------------------------------------------------
// Database tools
// ---------------------------------------------------------------------------

server.tool(
  'query',
  'Execute a SQL query. For DDL operations (CREATE TABLE, ALTER TABLE, DROP TABLE), prefer the dedicated tools which include safety checks. This tool is unrestricted but will warn on DDL statements.',
  {
    sql: z.string().describe('SQL statement to execute'),
    params: z.string().optional().describe('JSON array of query parameters'),
  },
  async ({ sql, params }) => {
    try {
      // Classify DDL for safety warnings
      const classification = client.classifyDdl(sql);
      let warning = '';
      if (classification.level === 'destructive' || classification.level === 'prohibited') {
        warning = `\n\n⚠ SAFETY WARNING [${classification.code}]: ${classification.reason}. Risk level: ${classification.level.toUpperCase()}. Consider using the dedicated tool (alter_table, drop_table) or review carefully before proceeding.\n`;
      } else if (classification.level !== 'unknown' && classification.level !== 'safe') {
        warning = `\n\nNote [${classification.code}]: ${classification.reason}.\n`;
      }

      const parsedParams = params ? (JSON.parse(params) as unknown[]) : undefined;
      const result = await client.query(sql, parsedParams);
      const columns = result.columns ?? [];
      const rows = result.rows ?? [];
      const header = columns.length > 0 ? columns.join('\t') : '';
      const body = rows.map((row) => (row as unknown[]).join('\t')).join('\n');
      const text = [header, body].filter(Boolean).join('\n');
      return {
        content: [{ type: 'text' as const, text: (text || '(no rows returned)') + warning }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'list_tables',
  'List all tables in the database',
  async () => {
    try {
      const result = await client.listTables();
      const tables = (result.rows ?? []).map((row) => (row as unknown[])[0]);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(tables, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'describe_table',
  'Get full table info: columns, constraints, indexes, foreign keys, and row count. Use this before modifying any table.',
  {
    table: z.string().describe('Table name to describe'),
  },
  async ({ table }) => {
    try {
      const [columns, constraints, indexes, rowCount] = await Promise.all([
        client.describeTable(table),
        client.getConstraints(table).catch(() => ({ columns: [], rows: [], rowCount: 0 })),
        client.getIndexes(table).catch(() => ({ columns: [], rows: [], rowCount: 0 })),
        client.getRowCount(table).catch(() => -1),
      ]);

      const sections: string[] = [];
      sections.push(`## ${table} (${rowCount >= 0 ? rowCount + ' rows' : 'row count unavailable'})\n`);
      sections.push('### Columns\n' + JSON.stringify(columns, null, 2));
      if (constraints.rows.length > 0) {
        sections.push('### Constraints\n' + JSON.stringify(constraints, null, 2));
      }
      if (indexes.rows.length > 0) {
        sections.push('### Indexes\n' + JSON.stringify(indexes, null, 2));
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n\n') }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'table_data',
  'Browse rows from a table with pagination',
  {
    table: z.string().describe('Table name to query'),
    limit: z.number().int().positive().optional().describe('Maximum rows to return (default 50)'),
    offset: z.number().int().nonnegative().optional().describe('Rows to skip (default 0)'),
  },
  async ({ table, limit, offset }) => {
    try {
      const result = await client.tableData(table, limit ?? 50, offset ?? 0);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'create_table',
  'Create a new table. SQL must start with CREATE TABLE and must not contain semicolons.',
  {
    sql: z.string().describe('CREATE TABLE DDL statement'),
  },
  async ({ sql }) => {
    try {
      await client.createTable(sql);
      const nameMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i);
      const tableName = nameMatch ? nameMatch[1] : 'unknown';
      return {
        content: [{ type: 'text' as const, text: `Table "${tableName}" created successfully.` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'insert_row',
  'Insert a row into a table. Data is a JSON object of column-value pairs. Supported value types: string, number, boolean, null.',
  {
    table: z.string().describe('Table name'),
    data: z.string().describe('JSON object of column→value pairs, e.g. {"name":"Alice","age":30}'),
  },
  async ({ table, data }) => {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      const result = await client.insertRow(table, parsed);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'alter_table',
  'Alter a table (add column, add constraint, etc). Classifies the change by risk level before executing. Destructive changes (drop column, change type, rename) require confirm=true.',
  {
    sql: z.string().describe('ALTER TABLE DDL statement'),
    confirm: z.boolean().optional().describe('Set true to confirm destructive changes. Required when risk is destructive.'),
  },
  async ({ sql, confirm }) => {
    try {
      const classification = client.classifyDdl(sql);

      if (classification.level === 'prohibited') {
        return {
          content: [{ type: 'text' as const, text: `BLOCKED [${classification.code}]: ${classification.reason}. This operation is prohibited. Use explicit per-table/per-column operations instead.` }],
          isError: true,
        };
      }

      if (classification.level === 'destructive' && !confirm) {
        // Get affected table name for context
        const nameMatch = sql.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?(\w+)["']?/i);
        const tableName = nameMatch ? nameMatch[1]! : 'unknown';
        let context = '';
        try {
          const rowCount = await client.getRowCount(tableName);
          context = `\nTable "${tableName}" has ${rowCount} rows.`;
          if (rowCount > 0) {
            const deps = await client.getDependents(tableName);
            if (deps.rows.length > 0) {
              context += `\nFK dependents: ${deps.rows.map(r => (r as unknown[])[0]).join(', ')}`;
            }
          }
        } catch { /* table info unavailable */ }

        return {
          content: [{ type: 'text' as const, text: `⚠ DESTRUCTIVE CHANGE [${classification.code}]: ${classification.reason}${context}\n\nTo proceed, call alter_table again with confirm=true. Show this warning to the user first.` }],
          isError: true,
        };
      }

      const result = await client.alterTable(sql);
      const text = `ALTER TABLE executed successfully. [${classification.code}: ${classification.reason}]`;
      return {
        content: [{ type: 'text' as const, text }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'drop_table',
  'Drop a table. Shows row count and FK dependents before dropping. Requires confirm=true — never auto-confirm. Always show the impact to the user first.',
  {
    table: z.string().describe('Table name to drop'),
    confirm: z.boolean().optional().describe('Must be true to actually drop. First call without confirm to see impact.'),
    cascade: z.boolean().optional().describe('Use CASCADE to also drop dependent objects (FKs, views)'),
  },
  async ({ table, confirm, cascade }) => {
    try {
      // Always show impact first
      const [rowCount, dependents] = await Promise.all([
        client.getRowCount(table).catch(() => -1),
        client.getDependents(table).catch(() => ({ columns: [], rows: [], rowCount: 0 })),
      ]);

      const depList = dependents.rows.map(r => `  - ${(r as unknown[])[0]}.${(r as unknown[])[1]} (FK: ${(r as unknown[])[2]})`).join('\n');
      const impact = [
        `Table: ${table}`,
        `Rows: ${rowCount >= 0 ? rowCount : 'unknown'}`,
        dependents.rows.length > 0 ? `FK dependents:\n${depList}` : 'FK dependents: none',
      ].join('\n');

      if (!confirm) {
        return {
          content: [{ type: 'text' as const, text: `⚠ DROP TABLE impact analysis:\n\n${impact}\n\n${rowCount > 0 ? `DATA LOSS: ${rowCount} rows will be permanently deleted.\n\n` : ''}To proceed, call drop_table with confirm=true${dependents.rows.length > 0 ? ' and cascade=true' : ''}. Show this to the user first.` }],
        };
      }

      // Confirmed — execute the drop
      const cascadeSql = cascade ? ' CASCADE' : '';
      await client.query(`DROP TABLE "${table}"${cascadeSql}`);
      return {
        content: [{ type: 'text' as const, text: `Table "${table}" dropped. ${rowCount > 0 ? `${rowCount} rows removed.` : ''}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'analyze_change',
  'Pre-flight analysis of a DDL statement. Shows what would change, the risk level (Sentinel code), and data impact — WITHOUT executing anything. Use this before any schema modification.',
  {
    sql: z.string().describe('DDL statement to analyze (CREATE TABLE, ALTER TABLE, DROP TABLE, etc)'),
  },
  async ({ sql }) => {
    try {
      const classification = client.classifyDdl(sql);
      const sections: string[] = [];

      sections.push(`## Schema Change Analysis`);
      sections.push(`**DDL:** \`${sql}\``);
      sections.push(`**Risk Level:** ${classification.level.toUpperCase()}`);
      sections.push(`**Sentinel Code:** ${classification.code}`);
      sections.push(`**Reason:** ${classification.reason}`);

      // Extract table name for data checks
      const nameMatch = sql.match(/(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?["']?(\w+)["']?/i);
      if (nameMatch) {
        const tableName = nameMatch[1]!;
        try {
          const rowCount = await client.getRowCount(tableName);
          sections.push(`\n### Data Impact`);
          sections.push(`**Table:** ${tableName}`);
          sections.push(`**Row count:** ${rowCount}`);

          if (classification.level === 'destructive' || classification.level === 'prohibited') {
            if (rowCount > 0) {
              sections.push(`**DATA AT RISK:** ${rowCount} rows may be affected or lost`);
            } else {
              sections.push(`**Data safe:** Table is empty`);
            }
          }

          const deps = await client.getDependents(tableName);
          if (deps.rows.length > 0) {
            sections.push(`**FK dependents:** ${deps.rows.map(r => (r as unknown[])[0]).join(', ')}`);
          }
        } catch {
          if (/^CREATE\s+TABLE\b/i.test(sql)) {
            sections.push(`\n*New table — no existing data to check.*`);
          }
        }
      }

      // Recommendation
      sections.push(`\n### Recommendation`);
      switch (classification.level) {
        case 'safe':
          sections.push(`Safe to execute. No data at risk.`);
          break;
        case 'migration':
          sections.push(`Requires data check before execution. Use the dedicated tool which validates data first.`);
          break;
        case 'destructive':
          sections.push(`**Show this analysis to the user before proceeding.** Use alter_table or drop_table with confirm=true after user approval.`);
          break;
        case 'prohibited':
          sections.push(`**BLOCKED.** This operation is not allowed. Use granular per-table/per-column operations instead.`);
          break;
        default:
          sections.push(`Could not fully classify. Review the SQL manually before executing.`);
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Help tools
// ---------------------------------------------------------------------------

server.tool(
  'help',
  'Get help on a VibeSQL topic. Available topics: architecture, products, glossary',
  {
    topic: z.string().describe('Topic name (architecture, products, or glossary)'),
  },
  async ({ topic }) => {
    const text = getHelp(topic);
    return {
      content: [{ type: 'text' as const, text }],
    };
  }
);

server.tool(
  'help_products',
  'VibeSQL product family overview — all 7 products and how they connect',
  async () => {
    return {
      content: [{ type: 'text' as const, text: HELP_TOPICS['products']! }],
    };
  }
);

server.tool(
  'help_architecture',
  'VibeSQL architecture patterns — envelope encryption, hash chains, Merkle trees',
  async () => {
    return {
      content: [{ type: 'text' as const, text: HELP_TOPICS['architecture']! }],
    };
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

log('registering 12 tools (query, list_tables, describe_table, table_data, create_table, insert_row, alter_table, drop_table, analyze_change, help, help_products, help_architecture)');

const transport = new StdioServerTransport();
await server.connect(transport);

log('MCP server connected — ready for tool calls');
