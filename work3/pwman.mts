import process from 'node:process';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {deriveKey, encrypt, decrypt, hashDerivedKey, } from './src/credentialCrypto.mts';



/**
 * ========================
 * 終了コード定義
 * ========================
 */
const ExitCode = {
  OK: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  AUTH_ERROR: 3,
  IO_DB_ERROR: 4,
} as const;

/**
 * ========================
 * 定数・パス設定
 * ========================
 */
const DB_FILE = 'pwman.db';
const args = process.argv.slice(2);
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
 * DB が初期化済みか確認する
 * init 以外の全コマンドで使用
 */
function ensureDbExists(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.error('Error: DB is not initialized. Please run init first.');
    process.exit(ExitCode.IO_DB_ERROR); // I/O・DB エラー
  }
}

/**
 * ========================
 * DB スキーマ
 * ========================
 */
const SCHEMA_SQL = `
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
`;


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
    export: `Usage: node pwman.mts export <csvFilePath> [--master <masterPassword>]`,
    import: `Usage: node pwman.mts import <csvFilePath> [--master <masterPassword>]`,
    changeMaster: `Usage: node pwman.mts change-master [--old-master <oldMasterPassword>] [--new-master <newMasterPassword>]`,
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
node pwman.mts export <csvFilePath> [--master <masterPassword>]
node pwman.mts import <csvFilePath> [--master <masterPassword>]
node pwman.mts change-master [--old-master <oldMasterPassword>] [--new-master <newMasterPassword>]
node pwman.mts status
node pwman.mts help`);
}

// TODO：：モジュールに切り出す
class ImportFormatError extends Error {
  public lineNumber: number;

  constructor(lineNumber: number, message: string) {
    super(message);
    this.lineNumber = lineNumber;
    this.name = 'ImportFormatError';
  }
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
    process.exit(ExitCode.GENERAL_ERROR);
  }

  const key = deriveKey(inputPw, row.salt);
  const hash = hashDerivedKey(key);

  /**
   * memo:timing safe compare
   * 処理時間を一定に保ちながら比較する関数
   * 秘密情報を比較する際、比較時間から情報を盗む
   * 「タイミング攻撃」を防ぐ
   */
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(row.password_hash, 'hex');

  // 長さが違うと timingSafeEqual は例外を投げる
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}


async function getMasterPassword(argIndex: number): Promise<string> {
  if (args[argIndex] === '--master' && args[argIndex + 1]) {
    return args[argIndex + 1];
  }
  return askPassword('Enter master password: ');
}

/**
 * change-master 用の引数解釈
 * @param name 
 * @returns 
 */
function getOption(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return undefined;
}

/**
 * change-master 用の引数検証
 */
function validateChangeMasterArgs(): void {
  const allowed = new Set(['--old-master', '--new-master']);

  for (let i = 1; i < args.length; i++) {
    const a = args[i];

    if (a.startsWith('--')) {
      if (!allowed.has(a)) {
        console.error(`Error: unknown option ${a}`);
        usage('changeMaster');
        process.exit(ExitCode.USAGE_ERROR);
      }
      i++; // 値を1つ消費
    } else {
      console.error(`Error: unexpected argument ${a}`);
      usage('changeMaster');
      process.exit(ExitCode.USAGE_ERROR);
    }
  }
}

/**
 * change-master 用の新マスターパスワード確認入力
 * @returns 
 */
async function askNewMasterWithConfirm(): Promise<string> {
  const pw1 = await askPassword('Enter new master password: ');
  const pw2 = await askPassword('Re-enter new master password: ');

  if (pw1 !== pw2) {
    console.error('Error: new master passwords do not match.');
    process.exit(ExitCode.USAGE_ERROR);
  }

  return pw1;
}

/**
 * 
 * @param db 
 * @returns 
 */
function getMasterSalt(db: DatabaseSync): string {
  const row = db.prepare(
    `SELECT salt FROM master WHERE id = 1`
  ).get() as { salt: string } | undefined;

  if (!row) {
    console.error('Error: master not initialized.');
    process.exit(ExitCode.GENERAL_ERROR);
  }

  return row.salt;
}


/**
 * ========================
 * 入力バリデーション
 * ========================
 */
const CONTROL_CHAR_RE = /[\t\r\n]/;

function validateNoControlChars(...values: string[]): void {
  for (const v of values) {
    if (CONTROL_CHAR_RE.test(v)) {
      console.error('Error: control characters are not allowed.');
      process.exit(ExitCode.GENERAL_ERROR);
    }
  }
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
  db.exec(SCHEMA_SQL);

    let masterPw: string;

  if (args.length === 3) {
    // CLI引数で指定された場合はそのまま使用
    masterPw = args[2];
  } else {
    // 対話入力時は再入力確認を行う
    masterPw = await askNewMasterWithConfirm();
  }
  
  if (!masterPw) {
    console.error('Error: Password cannot be empty');
    process.exit(ExitCode.USAGE_ERROR);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKey(masterPw, salt);
  const hash = hashDerivedKey(key);

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
    if (!(args.length === 4 || args.length === 6)) {
      usage('add');
      process.exit(ExitCode.USAGE_ERROR);
    }

    ensureDbExists();

    const [_, service, username, password] = args;
    const masterPw = await getMasterPassword(4);

    const db = openDb();
    if (!verifyMasterPassword(masterPw, db)) {
      console.error('Error: Authentication failed');
      process.exit(ExitCode.AUTH_ERROR);
    }

    // 制御文字チェック
    validateNoControlChars(service, username, password);

    try {
      const salt = getMasterSalt(db);
      const key = deriveKey(masterPw, salt);
      const encrypted = encrypt(password, key);

      db.prepare(
        `INSERT INTO credentials (service, username, password) VALUES (?, ?, ?)`
      ).run(service, username, encrypted);

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

  const [_, service, username] = args;
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

  // console.log(row.password);
  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);
  const decrypted = decrypt(row.password, key);

  console.log(`${service}, ${username},  password: ${decrypted}`);
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

  const [_, service, username] = args;
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
 * list
 * ========================
 */
async function cmdList(): Promise<void> {
  if (!(args.length === 1 || args.length === 3)) {
    usage('list');
    process.exit(ExitCode.USAGE_ERROR);
  }

  ensureDbExists();

  let orderBy = 'service';
  let order = 'ASC';

  if (args.length === 3) {
    const [flag, column] = [args[1], args[2]];
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
 * export
 * ========================
 */
async function cmdExport(): Promise<void> {
  if (!(args.length === 2 || args.length === 4)) {
    usage('export');
    process.exit(ExitCode.USAGE_ERROR);
  }

  ensureDbExists();

  const csvPath = args[1];

  // 「ディレクトリを指定してきた」＝ usage ミス
  if (fs.existsSync(csvPath) && fs.statSync(csvPath).isDirectory()) {
    console.error('Error: export target must be a file path, not a directory.');
    usage('export');
    process.exit(ExitCode.USAGE_ERROR);
  }
  const dir = path.dirname(csvPath);
  if (!fs.existsSync(dir)) {
    console.error(`Error: output directory does not exist: ${dir}`);
    process.exit(ExitCode.IO_DB_ERROR);
  }

  const masterPw = await getMasterPassword(2);
  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) {
    console.error('Error: invalid master password.');
    process.exit(ExitCode.AUTH_ERROR);
  }

  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);

  const rows = db.prepare(
    `SELECT service, username, password FROM credentials`
  ).all() as { service: string; username: string; password: string }[];

  const csv =
    'service,username,password\n' +
    rows
      .map(r => {
        const decrypted = decrypt(r.password, key);
        return `${r.service},${r.username},${decrypted}`;
      })
      .join('\n');

  fs.writeFileSync(csvPath, csv);
  console.log(`Success: Exported to ${csvPath}`);
  process.exit(ExitCode.OK);  
}



/**
 * ========================
 * import
 * ========================
 */
async function cmdImport(): Promise<void> {
  if (!(args.length === 2 || args.length === 4)) {
    usage('import');
    process.exit(ExitCode.USAGE_ERROR);
  }

  ensureDbExists();

  const file = args[1];
  if (!fs.existsSync(file)) {
    console.error(`Error: import file not found: ${file}`);
    process.exit(ExitCode.IO_DB_ERROR);
  }

  const masterPw = await getMasterPassword(2);
  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) {
    process.exit(ExitCode.AUTH_ERROR);
  }

  // =================
  // CSV 読み込み & 検証
  // =================
  let records: string[][] = [];
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const dataLines = lines.slice(1); // ヘッダ除去

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];

    // 末尾の空行（最後の改行）は許容
    if (line === '' && i === dataLines.length - 1) {
      continue;
    }

    // それ以外の空行は不正
    if (line === '') {
      throw new Error('Invalid CSV line: empty line');
    }

    const parts = line.split(',');
    if (parts.length !== 3) {
      throw new Error(`Invalid CSV line: ${line}`);
    }

    // 制御文字チェック
    // TODO::失敗行番号をユーザに伝えたい
    validateNoControlChars(...parts);

    records.push(parts);
  }
  } catch (e: unknown) {
    if (e instanceof ImportFormatError) {
      console.error(
        `Error: invalid import file at line ${e.lineNumber}: ${e.message}`
      );
    } else if (e instanceof Error) {
      console.error('Error: invalid import file:', e.message);
    } else {
      console.error('Unexpected error:', e);
    }

    process.exit(ExitCode.GENERAL_ERROR);
  }



  // ======================
  // DB import（全件 or 0件）
  // =======================
  try {
    const salt = getMasterSalt(db);
    const key = deriveKey(masterPw, salt);

    db.exec('BEGIN');
    db.exec(`DELETE FROM credentials`);

    for (const [s, u, p] of records) {
      const encrypted = encrypt(p, key);

      db.prepare(
        `INSERT INTO credentials VALUES (?, ?, ?)`
      ).run(s, u, encrypted);
    }

    db.exec('COMMIT');
    console.log(`Success: imported ${records.length} records.`);
    process.exit(ExitCode.OK);
  } catch (e: unknown) {
    if (e instanceof Error) {
      // e は Error 型として扱われる
      console.error('Error: invalid import file:', e.message);
    } else {
      // Errorオブジェクト以外が投げられた場合
      console.error('An unexpected error occurred:', e);
    }
    process.exit(ExitCode.GENERAL_ERROR);
  }

}

/**
 * ========================
 * change-master
 * ========================
 */
async function cmdChangeMaster(): Promise<void> {
  validateChangeMasterArgs();
  ensureDbExists();

  let oldPw = getOption('--old-master');
  let newPw = getOption('--new-master');

  if (!oldPw) {
    oldPw = await askPassword('Enter old master password: ');
  }

  if (!newPw) {
    newPw = await askNewMasterWithConfirm();
  }

  if (oldPw === newPw) {
    console.log('Info: master password unchanged.');
    process.exit(ExitCode.OK);
  }

  const db = openDb();

  if (!verifyMasterPassword(oldPw, db)) {
    console.error('Error: invalid old master password.');
    process.exit(ExitCode.AUTH_ERROR);
  }

  try {
    // master 情報取得
    const masterRow = db.prepare(
      `SELECT password_hash, salt FROM master WHERE id=1`
    ).get() as { password_hash: string; salt: string };

    // 鍵導出
    const oldKey = deriveKey(oldPw, masterRow.salt);
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newKey = deriveKey(newPw, newSalt);

    db.exec('BEGIN');

    // 1. 暗号文取得
    const encryptedRows = db.prepare(
      `SELECT service, username, password FROM credentials`
    ).all() as { service: string; username: string; password: string }[];

    // 2. 復号
    const plainRows = encryptedRows.map(r => ({
      service: r.service,
      username: r.username,
      password: decrypt(r.password, oldKey),
    }));

    // 3. master 更新
    const newHash = hashDerivedKey(newKey);
    db.prepare(
      `UPDATE master SET password_hash=?, salt=? WHERE id=1`
    ).run(newHash, newSalt);

    // 4. 再暗号化
    db.exec(`DELETE FROM credentials`);

    const insert = db.prepare(
      `INSERT INTO credentials (service, username, password)
      VALUES (?, ?, ?)`
    );

    for (const r of plainRows) {
      insert.run(
        r.service,
        r.username,
        encrypt(r.password, newKey)
      );
    }

    // ======================
    // COMMIT
    // ======================
    db.exec('COMMIT');

    console.log('Success: master password changed.');
    process.exit(ExitCode.OK);

  } catch (e) {
    // ======================
    // ROLLBACK
    // ======================
    db.exec('ROLLBACK');
    console.error('Error: failed to change master password.');
    process.exit(ExitCode.GENERAL_ERROR);
  }
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
    case 'export': await cmdExport(); break;
    case 'import': await cmdImport(); break;
    case 'change-master': await cmdChangeMaster(); break;
    case 'help': usage(); process.exit(ExitCode.OK);
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(ExitCode.USAGE_ERROR);
  }
})();