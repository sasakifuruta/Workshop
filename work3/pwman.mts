// pwman.mts
import { ARGS, COMMAND } from './src/config.mts';
import { openDb, ensureDbExists, SCHEMA_SQL } from './src/db.mts';
import {
  verifyMasterPassword,
  getMasterPassword,
  askNewMasterWithConfirm,
  getMasterSalt
} from './src/master.mts';
import { validateNoControlChars, getOption, askPassword } from './src/utils.mts';
import { deriveKey, encrypt, decrypt, hashDerivedKey } from './src/credentialCrypto.mts';
import { exitWith, ExitCode } from './src/exitHandler.mts';
import { Messages } from './src/messages.mts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';


/**
 * ========================
 * コマンド実装
 * ========================
 */

/**
 * ========================
 * init
 * ========================
 */
async function cmdInit(args: string[]): Promise<void> {
  if (!(args.length === 1 || (args.length === 3 && args[1] === '--master'))) {
    exitWith(ExitCode.USAGE_ERROR, Messages.usage.init);
  }
  if (fs.existsSync(path.join(process.cwd(), 'pwman.db'))) {
    exitWith(ExitCode.GENERAL_ERROR, Messages.errors.dbAlreadyInitialized);
  }

  const db = openDb();
  db.exec(SCHEMA_SQL);

  const masterPw = args.length === 3 ? args[2] : await askNewMasterWithConfirm();

  if (!masterPw) exitWith(ExitCode.USAGE_ERROR, Messages.errors.emptyPassword);

  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKey(masterPw, salt);
  const hash = hashDerivedKey(key);

  db.prepare(`INSERT INTO master (id, password_hash, salt) VALUES (1, ?, ?)`).run(hash, salt);
  exitWith(ExitCode.OK, Messages.infos.dbInitialized);
}


/* ========================
 * add
 * ========================
 */
async function cmdAdd(args: string[]): Promise<void> {
  if (!(args.length === 4 || args.length === 6)) exitWith(ExitCode.USAGE_ERROR, Messages.usage.add);

  ensureDbExists();
  const [_, service, username, password] = args;
  const masterPw = await getMasterPassword(args, 4);

  validateNoControlChars(service, username, password);

  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);

  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);
  const encrypted = encrypt(password, key);

  try {
    db.prepare(`INSERT INTO credentials (service, username, password) VALUES (?, ?, ?)`)
      .run(service, username, encrypted);
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE constraint failed')) {
      exitWith(ExitCode.GENERAL_ERROR, `Entry already exists: ${service} ${username}`);
    }
    exitWith(ExitCode.IO_DB_ERROR, Messages.errors.ioError);
  }

  exitWith(ExitCode.OK, `Added: ${service} ${username}`);
}


/**
 * ========================
 * get
 * ========================
 */
async function cmdGet(args: string[]): Promise<void> {
  if (args.length < 3) exitWith(ExitCode.USAGE_ERROR, Messages.usage.get);

  ensureDbExists();
  const [_, service, username] = args;
  const masterPw = await getMasterPassword(args, 3);

  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);

  const row = db.prepare(`SELECT password FROM credentials WHERE service=? AND username=?`).get(service, username) as { password: string } | undefined;
  if (!row) exitWith(ExitCode.GENERAL_ERROR, Messages.errors.entryNotFound);

  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);
  const decrypted = decrypt(row.password, key);

  exitWith(ExitCode.OK, `${service}, ${username}, password: ${decrypted}`);
}

/**
 * ========================
 * del
 * ========================
 */
async function cmdDel(args: string[]): Promise<void> {
  if (args.length < 3) exitWith(ExitCode.USAGE_ERROR, Messages.usage.del);

  ensureDbExists();
  const [_, service, username] = args;
  const masterPw = await getMasterPassword(args, 3);

  let db;
  try {
    db = openDb();
  } catch (e: any) {
    exitWith(ExitCode.IO_DB_ERROR, `Error accessing DB: ${e?.message ?? String(e)}`);
  }

  if (!verifyMasterPassword(masterPw, db)) {
    exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);
  }

  try {
    const res = db.prepare(`DELETE FROM credentials WHERE service=? AND username=?`)
                  .run(service, username);
    if (res.changes === 0) exitWith(ExitCode.GENERAL_ERROR, Messages.errors.entryNotFound);

  } catch (e: any) {
    exitWith(ExitCode.IO_DB_ERROR, `Error accessing DB: ${e?.message ?? String(e)}`);
  }

  exitWith(ExitCode.OK, Messages.infos.entryDeleted);
}




/**
 * ========================
 * list
 * ========================
 */
async function cmdList(args: string[]): Promise<void> {
  if (!(args.length === 1 || args.length === 3)) exitWith(ExitCode.USAGE_ERROR, Messages.usage.list);

  ensureDbExists();
  let orderBy = 'service';
  let order = 'ASC';

  if (args.length === 3) {
    const [flag, column] = [args[1], args[2]];
    if (!['--asc', '--desc'].includes(flag) || !['service', 'username'].includes(column)) {
      exitWith(ExitCode.USAGE_ERROR, Messages.usage.list);
    }
    order = flag === '--desc' ? 'DESC' : 'ASC';
    orderBy = column;
  }

  const db = openDb();
  const rows = db.prepare(`SELECT service, username FROM credentials ORDER BY ${orderBy} ${order}`)
                 .all() as { service: string; username: string }[];

  if (rows.length === 0) {
    exitWith(ExitCode.OK, Messages.infos.NoData);
  } else {
    rows.forEach(r => console.log(`${r.service} ${r.username}`));
  }

  exitWith(ExitCode.OK);
}

/**
 * ========================
 * status
 * ========================
 */
async function cmdStatus(args: string[]): Promise<void> {
  if (args.length !== 1) exitWith(ExitCode.USAGE_ERROR, Messages.usage.status);

  ensureDbExists();

  let db;
  try {
    db = openDb();
    const row = db.prepare(`SELECT COUNT(*) AS count FROM credentials`).get() as { count: number };

    console.log(Messages.infos.initializedYes);
    console.log(`Entries: ${row.count}`);
  } catch (e: any) {
    exitWith(ExitCode.IO_DB_ERROR, `Error accessing DB: ${e?.message ?? String(e)}`);
  }

  exitWith(ExitCode.OK);
}


/**
 * ========================
 * export
 * ========================
 */
async function cmdExport(args: string[]): Promise<void> {
  if (!(args.length === 2 || args.length === 4)) exitWith(ExitCode.USAGE_ERROR, Messages.usage.export);

  ensureDbExists();
  const csvPath = args[1];

  if (fs.existsSync(csvPath) && fs.statSync(csvPath).isDirectory()) {
    exitWith(ExitCode.USAGE_ERROR, Messages.errors.exportTargetDir);
  }
  if (!fs.existsSync(path.dirname(csvPath))) {
    exitWith(ExitCode.IO_DB_ERROR, Messages.errors.exportDirNotExist(path.dirname(csvPath)));
  }

  const masterPw = await getMasterPassword(args, 2);
  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);

  const salt = getMasterSalt(db);
  const key = deriveKey(masterPw, salt);

  const rows = db.prepare(`SELECT service, username, password FROM credentials`).all() as { service: string; username: string; password: string }[];
  const csv = 'service,username,password\n' + rows.map(r => `${r.service},${r.username},${decrypt(r.password, key)}`).join('\n');

  fs.writeFileSync(csvPath, csv);
  exitWith(ExitCode.OK, `Success: Exported to ${csvPath}`);
}

/**
 * ========================
 * import
 * ========================
 */
async function cmdImport(args: string[]): Promise<void> {
  if (!(args.length === 2 || args.length === 4)) exitWith(ExitCode.USAGE_ERROR, Messages.usage.import);

  ensureDbExists();
  const file = args[1];
  if (!fs.existsSync(file)) exitWith(ExitCode.IO_DB_ERROR, `Error: import file not found: ${file}`);

  const masterPw = await getMasterPassword(args, 2);
  const db = openDb();
  if (!verifyMasterPassword(masterPw, db)) exitWith(ExitCode.AUTH_ERROR, Messages.errors.authFailed);

  // CSVフォーマットチェック
  let records: string[][] = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const dataLines = lines.slice(1); // ヘッダ除去

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (line === '' && i === dataLines.length - 1) continue;
    if (line === '') exitWith(ExitCode.GENERAL_ERROR, Messages.errors.invalidImportLine(i + 2));

    const parts = line.split(',');
    if (parts.length !== 3) exitWith(ExitCode.GENERAL_ERROR, Messages.errors.invalidImportFormat);

    validateNoControlChars(...parts);
    records.push(parts);
  }

  // DB アクセス
  try {
    const salt = getMasterSalt(db);
    const key = deriveKey(masterPw, salt);

    db.exec('BEGIN');
    db.exec(`DELETE FROM credentials`);

    const insert = db.prepare(`INSERT INTO credentials VALUES (?, ?, ?)`);
    for (const [s, u, p] of records) {
      insert.run(s, u, encrypt(p, key));
    }

    db.exec('COMMIT');
  } catch (e: any) {
    try { db.exec('ROLLBACK'); } catch {}
    exitWith(ExitCode.IO_DB_ERROR, Messages.errors.importFailed);
  }

  exitWith(ExitCode.OK, `Success: imported ${records.length} records.`);
}

/**
 * ========================
 * change-master
 * ========================
 */
async function cmdChangeMaster(args: string[]): Promise<void> {
  const allowed = new Set(['--old-master', '--new-master']);
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      if (!allowed.has(a)) exitWith(ExitCode.USAGE_ERROR, Messages.usage.changeMaster);
      i++;
    } else exitWith(ExitCode.USAGE_ERROR, Messages.usage.changeMaster);
  }

  ensureDbExists();

  const oldPw = getOption(args, '--old-master')?? await askPassword(Messages.prompts.enterOldMaster);
  const newPw = getOption(args, '--new-master') ?? await askNewMasterWithConfirm();

  if (oldPw === newPw) {
    exitWith(ExitCode.OK, Messages.infos.masterUnchanged);
  }

  const db = openDb();

  if (!verifyMasterPassword(oldPw, db)) {
    exitWith(ExitCode.AUTH_ERROR, Messages.errors.invalidOldMaster);
  }

  try {
    // 既存マスター情報取得
    const masterRow = db.prepare(`SELECT password_hash, salt FROM master WHERE id=1`).get() as { password_hash: string; salt: string };
    const oldKey = deriveKey(oldPw, masterRow.salt);
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newKey = deriveKey(newPw, newSalt);

    db.exec('BEGIN');

    // パスワードを復号して新キーで再暗号化
    const encryptedRows = db.prepare(`SELECT service, username, password FROM credentials`).all() as { service: string; username: string; password: string }[];
    const plainRows = encryptedRows.map(r => ({
      service: r.service,
      username: r.username,
      password: decrypt(r.password, oldKey)
    }));

    // マスター更新
    const newHash = hashDerivedKey(newKey);
    db.prepare(`UPDATE master SET password_hash=?, salt=? WHERE id=1`).run(newHash, newSalt);

    // 既存資格情報削除 → 再挿入
    db.prepare(`DELETE FROM credentials`).run();
    const insert = db.prepare(`INSERT INTO credentials (service, username, password) VALUES (?, ?, ?)`);
    for (const r of plainRows) {
      insert.run(r.service, r.username, encrypt(r.password, newKey));
    }

    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    exitWith(ExitCode.GENERAL_ERROR, Messages.errors.changeMasterFailed);
  }
    exitWith(ExitCode.OK, Messages.infos.masterChanged);
}


/**
 * ========================
 * main
 * ========================
 */
(async () => {
  try {
    const args = process.argv.slice(2);
    switch (COMMAND) {
      case 'init': await cmdInit(args); break;
      case 'add': await cmdAdd(args); break;
      case 'get': await cmdGet(args); break;
      case 'del': await cmdDel(args); break;
      case 'list': await cmdList(args); break;
      case 'status': await cmdStatus(args); break;
      case 'export': await cmdExport(args); break;
      case 'import': await cmdImport(args); break;
      case 'change-master': await cmdChangeMaster(args); break;
      case 'help': exitWith(ExitCode.OK, Messages.usage.help); break;
      default: exitWith(ExitCode.USAGE_ERROR, `Unknown command: ${COMMAND} \n` + Messages.usage.help);
    }
  } catch (err: any) {
    if (err?.code !== undefined) process.exit(err.code);
    console.error('Unexpected error:', err);
    process.exit(ExitCode.GENERAL_ERROR);
  }
})();
