export interface QueryResult {
    columns: string[];
    rows: unknown[][];
    rowCount: number;
}
export declare class VibeClient {
    private readonly baseUrl;
    private readonly secret?;
    constructor(baseUrl: string, secret?: string);
    health(): Promise<{
        status: string;
    }>;
    query(sql: string, params?: unknown[]): Promise<QueryResult>;
    listTables(): Promise<QueryResult>;
    describeTable(table: string): Promise<QueryResult>;
    tableData(table: string, limit: number, offset: number): Promise<QueryResult>;
    insertRow(table: string, data: Record<string, unknown>): Promise<QueryResult>;
    createTable(sql: string): Promise<QueryResult>;
    alterTable(sql: string): Promise<QueryResult>;
    getRowCount(table: string): Promise<number>;
    getConstraints(table: string): Promise<QueryResult>;
    getIndexes(table: string): Promise<QueryResult>;
    getDependents(table: string): Promise<QueryResult>;
    /**
     * Classify a DDL statement by its risk level.
     * Returns: 'safe' | 'migration' | 'destructive' | 'prohibited'
     */
    classifyDdl(sql: string): {
        level: string;
        code: string;
        reason: string;
    };
}
