// import process from 'node:process';
// import path from 'node:path';
// import crypto from 'node:crypto';
// import fs from 'node:fs';
// import { fileURLToPath } from 'node:url';
// import { DatabaseSync } from 'node:sqlite';
// import readline from 'node:readline/promises';
// import { stdin as input, stdout as output } from 'node:process';

// /**
//  * ========================
//  * 定数・パス設定
//  * ========================
//  */
// const DB_FILE = 'pwman.db';
// const args = process.argv.slice(2);
// const command = args[0];

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const DB_PATH = path.join(process.cwd(), DB_FILE);

// /**
//  * ========================
//  * SQLite DB
//  * ========================
//  */
// function openDb(): DatabaseSync {
//   return new DatabaseSync(DB_PATH);
// }

// /**
//  * DB が初期化済みか確認する
//  * init 以外の全コマンドで使用
//  */
// function ensureDbExists(): void {
//   if (!fs.existsSync(DB_PATH)) {
//     console.error('Error: DB is not initialized. Please run init first.');
//     process.exit(4); // I/O・DB エラー
//   }
// }

// /**
//  * ========================
//  * DB スキーマ
//  * ========================
//  */
// const SCHEMA_SQL = `
// CREATE TABLE credentials (
//   service TEXT NOT NULL,
//   username TEXT NOT NULL,
//   password TEXT NOT NULL,
//   PRIMARY KEY (service, username)
// );

// CREATE TABLE master (
//   id INTEGER PRIMARY KEY CHECK (id = 1),
//   password_hash TEXT NOT NULL,
//   salt TEXT NOT NULL
// );
// `;

// /**
//  * ========================
//  * Usage
//  * ========================
//  */
// function usage(cmd?: string): void {
//   const map: Record<string, string> = {
//     init: `Usage: node pwman.mts init [--master <masterPassword>]`,
//     add: `Usage: node pwman.mts add <service> <username> <password> [--master <masterPassword>]`,
//     get: `Usage: node pwman.mts get <service> <username> [--master <masterPassword>]`,
//     del: `Usage: node pwman.mts del <service> <username> [--master <masterPassword>]`,
//     list: `Usage: node pwman.mts list [--asc service|username] [--desc service|username]`,
//     status: `Usage: node pwman.mts status`,
//     help: `Usage: node pwman.mts help`,
//   };

//   if (cmd && map[cmd]) {
//     console.log(map[cmd]);
//     return;
//   }

//   console.log(`Usage:
// node pwman.mts init [--master <masterPassword>]
// node pwman.mts add <service> <username> <password> [--master <masterPassword>]
// node pwman.mts get <service> <username> [--master <masterPassword>]
// node pwman.mts del <service> <username> [--master <masterPassword>]
// node pwman.mts list [--asc service|username] [--desc service|username]
// node pwman.mts status
// node pwman.mts help`);
// }

// /**
//  * ========================
//  * 対話式パスワード入力
//  * ========================
//  */
// async function askPassword(prompt: string): Promise<string> {
//   const rl = readline.createInterface({ input, output });
//   const pw = await rl.question(prompt);
//   rl.close();
//   return pw.trim();
// }

// /**
//  * ========================
//  * Master password
//  * ========================
//  */
// function verifyMasterPassword(inputPw: string, db: DatabaseSync): boolean {
//   const row = db
//     .prepare(`SELECT password_hash, salt FROM master WHERE id = 1`)
//     .get() as { password_hash: string; salt: string } | undefined;

//   if (!row) {
//     console.error('Error: Master password not set');
//     process.exit(4);
//   }

//   const hash = crypto
//     .createHash('sha256')
//     .update(inputPw + row.salt)
//     .digest('hex');

//   return hash === row.password_hash;
// }

// async function getMasterPassword(argIndex: number): Promise<string> {
//   if (args[argIndex] === '--master' && args[argIndex + 1]) {
//     return args[argIndex + 1];
//   }
//   return askPassword('Enter master password: ');
// }

// /**
//  * ========================
//  * init
//  * ========================
//  */
// async function cmdInit(): Promise<void> {
//   if (!(args.length === 1 || (args.length === 3 && args[1] === '--master'))) {
//     usage('init');
//     process.exit(2);
//   }

//   if (fs.existsSync(DB_PATH)) {
//     console.error('Error: DB already initialized');
//     process.exit(1);
//   }

//   const db = openDb();
//   db.exec(SCHEMA_SQL);

//   const masterPw = args.length === 3 ? args[2] : await askPassword('Set master password: ');
//   if (!masterPw) {
//     console.error('Error: Password cannot be empty');
//     process.exit(2);
//   }

//   const salt = crypto.randomBytes(16).toString('hex');
//   const hash = crypto.createHash('sha256').update(masterPw + salt).digest('hex');

//   db.prepare(
//     `INSERT INTO master (id, password_hash, salt) VALUES (1, ?, ?)`
//   ).run(hash, salt);

//   console.log('DB initialized.');
//   process.exit(0);
// }

// /**
//  * ========================
//  * add
//  * ========================
//  */
// async function cmdAdd(): Promise<void> {
//   if (args.length < 4) {
//     usage('add');
//     process.exit(2);
//   }

//   ensureDbExists();

//   const [_, service, username, password] = args;
//   const masterPw = await getMasterPassword(4);

//   const db = openDb();
//   if (!verifyMasterPassword(masterPw, db)) {
//     console.error('Error: Authentication failed');
//     process.exit(3);
//   }

//   try {
//     db.prepare(
//       `INSERT INTO credentials (service, username, password) VALUES (?, ?, ?)`
//     ).run(service, username, password);
//     console.log(`Added: ${service} ${username}`);
//     process.exit(0);
//   } catch {
//     console.error('Error: DB error');
//     process.exit(4);
//   }
// }

// /**
//  * ========================
//  * get
//  * ========================
//  */
// async function cmdGet(): Promise<void> {
//   if (args.length < 3) {
//     usage('get');
//     process.exit(2);
//   }

//   ensureDbExists();

//   const [_, service, username] = args;
//   const masterPw = await getMasterPassword(3);

//   const db = openDb();
//   if (!verifyMasterPassword(masterPw, db)) {
//     console.error('Error: Authentication failed');
//     process.exit(3);
//   }

//   const row = db.prepare(
//     `SELECT password FROM credentials WHERE service=? AND username=?`
//   ).get(service, username) as { password: string } | undefined;

//   if (!row) {
//     console.error('Error: Entry not found');
//     process.exit(1);
//   }

//   console.log(row.password);
//   process.exit(0);
// }

// /**
//  * ========================
//  * del
//  * ========================
//  */
// async function cmdDel(): Promise<void> {
//   if (args.length < 3) {
//     usage('del');
//     process.exit(2);
//   }

//   ensureDbExists();

//   const [_, service, username] = args;
//   const masterPw = await getMasterPassword(3);

//   const db = openDb();
//   if (!verifyMasterPassword(masterPw, db)) {
//     console.error('Error: Authentication failed');
//     process.exit(3);
//   }

//   const res = db.prepare(
//     `DELETE FROM credentials WHERE service=? AND username=?`
//   ).run(service, username);

//   if (res.changes === 0) {
//     console.error('Error: Entry not found');
//     process.exit(1);
//   }

//   console.log('Deleted.');
//   process.exit(0);
// }

// /**
//  * ========================
//  * list
//  * ========================
//  */
// async function cmdList(): Promise<void> {
//   if (args.length === 2 || args.length > 3) {
//     usage('list');
//     process.exit(2);
//   }

//   ensureDbExists();

//   let orderBy = 'service';
//   let order = 'ASC';

//   if (args.length === 3) {
//     const [flag, column] = [args[1], args[2]];
//     if (!['--asc', '--desc'].includes(flag) || !['service', 'username'].includes(column)) {
//       usage('list');
//       process.exit(2);
//     }
//     order = flag === '--desc' ? 'DESC' : 'ASC';
//     orderBy = column;
//   }

//   const db = openDb();
//   const rows = db.prepare(
//     `SELECT service, username FROM credentials ORDER BY ${orderBy} ${order}`
//   ).all() as { service: string; username: string }[];

//   rows.forEach(r => console.log(`${r.service} ${r.username}`));
//   process.exit(0);
// }

// /**
//  * ========================
//  * status
//  * ========================
//  */
// async function cmdStatus(): Promise<void> {
//   if (args.length !== 1) {
//     usage('status');
//     process.exit(2);
//   }

//   if (!fs.existsSync(DB_PATH)) {
//     console.log('Initialized: no');
//     process.exit(1);
//   }

//   const db = openDb();
//   const row = db.prepare(`SELECT COUNT(*) AS count FROM credentials`).get() as { count: number };

//   console.log('Initialized: yes');
//   console.log(`Entries: ${row.count}`);
//   process.exit(0);
// }

// /**
//  * ========================
//  * main
//  * ========================
//  */
// (async () => {
//   switch (command) {
//     case 'init': await cmdInit(); break;
//     case 'add': await cmdAdd(); break;
//     case 'get': await cmdGet(); break;
//     case 'del': await cmdDel(); break;
//     case 'list': await cmdList(); break;
//     case 'status': await cmdStatus(); break;
//     case 'help': usage(); process.exit(0);
//     default:
//       console.error(`Unknown command: ${command}`);
//       usage();
//       process.exit(2);
//   }
// })();


import process from 'node:process';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/**
 * ========================
 * 終了コード定義（仕様書準拠）
 * ========================
 */
enum ExitCode {
  OK = 0,
  GENERAL_ERROR = 1,
  USAGE_ERROR = 2,
  AUTH_ERROR = 3,
  IO_DB_ERROR = 4,
}

/**
 * ========================
 * 定数・パス設定
 * ========================
 */
const DB_FILE = 'pwman.db';

/**
 * テスト実行時に空文字が混ざることがあるため、
 * CLI 引数は最初に正規化する
 */
const rawArgs = process.argv.slice(2);
const args = rawArgs.filter(a => a !== '');
const command = args[0];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(process.cwd(), DB_FILE);

/**
 * ========================
 * SQLite DB
 * ========================
 */
function openDb(): DatabaseSync {
  return new DatabaseSync(DB_PATH);
}

/**
 * init 以外の全コマンドで使用する DB 存在チェック
 */
function ensureDbExists(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Error: DB is not initialized. Please run init first.');
    process.exit(ExitCode.IO_DB_ERROR);
  }
}

/**
 * ========================
 * Usage
 * ========================
 */
function usage(cmd?: string): void {
  const map: Record<string, string> = {
    init: `Usage: node pwman.mts init [--master <masterPassword>]`,
    add: `Usage: node pwman.mts add <service> <username> <password> [--master <masterPassword>]`,
    get: `Usage: node pwman.mts get <service> <username> [--master <masterPassword>]`,
    del: `Usage: node pwman.mts del <service> <username> [--master <masterPassword>]`,
    list: `Usage: node pwman.mts list [--asc service|username] [--desc service|username]`,
    status: `Usage: node pwman.mts status`,
    help: `Usage: node pwman.mts help`,
  };

  if (cmd && map[cmd]) {
    console.log(map[cmd]);
    return;
  }

  console.log(`Usage:
node pwman.mts init [--master <masterPassword>]
node pwman.mts add <service> <username> <password> [--master <masterPassword>]
node pwman.mts get <service> <username> [--master <masterPassword>]
node pwman.mts del <service> <username> [--master <masterPassword>]
node pwman.mts list [--asc service|username] [--desc service|username]
node pwman.mts status
node pwman.mts help`);
}

/**
 * ========================
 * 対話式パスワード入力
 * ========================
 */
async function askPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const pw = await rl.question(prompt);
  rl.close();
  return pw.trim();
}

/**
 * ========================
 * Master password
 * ========================
 */
function verifyMasterPassword(inputPw: string, db: DatabaseSync): boolean {
  const row = db
    .prepare(`SELECT password_hash, salt FROM master WHERE id = 1`)
    .get() as { password_hash: string; salt: string } | undefined;

  if (!row) {
    console.error('Error: Master password not set');
    process.exit(ExitCode.IO_DB_ERROR);
  }

  const hash = crypto
    .createHash('sha256')
    .update(inputPw + row.salt)
    .digest('hex');

  return hash === row.password_hash;
}

async function getMasterPassword(argIndex: number): Promise<string> {
  if (args[argIndex] === '--master' && args[argIndex + 1]) {
    return args[argIndex + 1];
  }
  return askPassword('Enter master password: ');
}

/**
 * ========================
 * init
 * ========================
 */
async function cmdInit(): Promise<void> {
  if (!(args.length === 1 || (args.length === 3 && args[1] === '--master'))) {
    usage('init');
    process.exit(ExitCode.USAGE_ERROR);
  }

  if (fs.existsSync(DB_PATH)) {
    console.error('Error: DB already initialized');
    process.exit(ExitCode.GENERAL_ERROR);
  }

  const db = openDb();
  db.exec(`
    CREATE TABLE credentials (
      service TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      PRIMARY KEY (service, username)
    );
    CREATE TABLE master (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL
    );
  `);

  const masterPw = args.length === 3 ? args[2] : await askPassword('Set master password: ');
  if (!masterPw) {
    console.error('Error: Password cannot be empty');
    process.exit(ExitCode.USAGE_ERROR);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(masterPw + salt).digest('hex');

  db.prepare(
    `INSERT INTO master (id, password_hash, salt) VALUES (1, ?, ?)`
  ).run(hash, salt);

  console.log('DB initialized.');
  process.exit(ExitCode.OK);
}

/**
 * ========================
 * add
 * ========================
 */
async function cmdAdd(): Promise<void> {
  /**
   * add <service> <username> <password> [--master <pw>]
   * --master は 4 番目以降にしか現れてはいけない
   */
  if (
    args.length < 4 ||
    (args.includes('--master') && args.indexOf('--master') !== 4) ||
    args[3] === '--master'
  ) {
    usage('add');
    process.exit(ExitCode.USAGE_ERROR);
  }

  ensureDbExists();

  const service = args[1];
  const username = args[2];
  const password = args[3];

  const masterPw = await getMasterPassword(4);
  const db = openDb();

  if (!verifyMasterPassword(masterPw, db)) {
    console.error('Error: Authentication failed');
    process.exit(ExitCode.AUTH_ERROR);
  }

  try {
    db.prepare(
      `INSERT INTO credentials (service, username, password) VALUES (?, ?, ?)`
    ).run(service, username, password);
    console.log(`Added: ${service} ${username}`);
    process.exit(ExitCode.OK);
  } catch {
    console.error('Error: DB error');
    process.exit(ExitCode.IO_DB_ERROR);
  }
}

/**
 * ========================
 * get
 * ========================
 */
async function cmdGet(): Promise<void> {
  if (args.length < 3) {
    usage('get');
    process.exit(ExitCode.USAGE_ERROR);
  }

  ensureDbExists();

  const service = args[1];
  const username = args[2];
  const masterPw = await getMasterPassword(3);

  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) {
    console.error('Error: Authentication failed');
    process.exit(ExitCode.AUTH_ERROR);
  }

  const row = db.prepare(
    `SELECT password FROM credentials WHERE service=? AND username=?`
  ).get(service, username) as { password: string } | undefined;

  if (!row) {
    console.error('Error: Entry not found');
    process.exit(ExitCode.GENERAL_ERROR);
  }

  console.log(row.password);
  process.exit(ExitCode.OK);
}

/**
 * ========================
 * del
 * ========================
 */
async function cmdDel(): Promise<void> {
  if (args.length < 3) {
    usage('del');
    process.exit(ExitCode.USAGE_ERROR);
  }

  ensureDbExists();

  const service = args[1];
  const username = args[2];
  const masterPw = await getMasterPassword(3);

  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) {
    console.error('Error: Authentication failed');
    process.exit(ExitCode.AUTH_ERROR);
  }

  const res = db.prepare(
    `DELETE FROM credentials WHERE service=? AND username=?`
  ).run(service, username);

  if (res.changes === 0) {
    console.error('Error: Entry not found');
    process.exit(ExitCode.GENERAL_ERROR);
  }

  console.log('Deleted.');
  process.exit(ExitCode.OK);
}

/**
 * ========================
 * list
 * ========================
 */
async function cmdList(): Promise<void> {
  if (args.length === 2 || args.length > 3) {
    usage('list');
    process.exit(ExitCode.USAGE_ERROR);
  }

  ensureDbExists();

  let orderBy = 'service';
  let order = 'ASC';

  if (args.length === 3) {
    const flag = args[1];
    const column = args[2];

    if (!['--asc', '--desc'].includes(flag) || !['service', 'username'].includes(column)) {
      usage('list');
      process.exit(ExitCode.USAGE_ERROR);
    }

    order = flag === '--desc' ? 'DESC' : 'ASC';
    orderBy = column;
  }

  const db = openDb();
  const rows = db.prepare(
    `SELECT service, username FROM credentials ORDER BY ${orderBy} ${order}`
  ).all() as { service: string; username: string }[];

  rows.forEach(r => console.log(`${r.service} ${r.username}`));
  process.exit(ExitCode.OK);
}

/**
 * ========================
 * status
 * ========================
 */
async function cmdStatus(): Promise<void> {
  if (args.length !== 1) {
    usage('status');
    process.exit(ExitCode.USAGE_ERROR);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.log('Initialized: no');
    process.exit(ExitCode.GENERAL_ERROR);
  }

  const db = openDb();
  const row = db.prepare(`SELECT COUNT(*) AS count FROM credentials`).get() as { count: number };

  console.log('Initialized: yes');
  console.log(`Entries: ${row.count}`);
  process.exit(ExitCode.OK);
}

/**
 * ========================
 * main
 * ========================
 */
(async () => {
  switch (command) {
    case 'init': await cmdInit(); break;
    case 'add': await cmdAdd(); break;
    case 'get': await cmdGet(); break;
    case 'del': await cmdDel(); break;
    case 'list': await cmdList(); break;
    case 'status': await cmdStatus(); break;
    case 'help': usage(); process.exit(ExitCode.OK);
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(ExitCode.USAGE_ERROR);
  }
})();
