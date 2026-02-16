declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string);
    prepare(sql: string): Statement;
    exec(sql: string): void;
    close(): void;
    pragma(pragma: string): any;
  }

  class Statement {
    run(...params: any[]): any;
    get(...params: any[]): any;
    all(...params: any[]): any;
  }

  export = Database;
}
