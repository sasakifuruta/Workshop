/**
 * ========================
 * メッセージ定義
 * ========================
 */
export const Messages = {
  // ------------------------
  // Usage メッセージ
  // ------------------------
  usage: {
    init: 'Usage: node pwman.mts init [--master <masterPassword>]',
    add: 'Usage: node pwman.mts add <service> <username> <password> [--master <masterPassword>]',
    get: 'Usage: node pwman.mts get <service> <username> [--master <masterPassword>]',
    del: 'Usage: node pwman.mts del <service> <username> [--master <masterPassword>]',
    list: 'Usage: node pwman.mts list [--asc service|username] [--desc service|username]',
    export: 'Usage: node pwman.mts export <csvFilePath> [--master <masterPassword>]',
    import: 'Usage: node pwman.mts import <csvFilePath> [--master <masterPassword>]',
    changeMaster: 'Usage: node pwman.mts change-master [--old-master <oldMasterPassword>] [--new-master <newMasterPassword>]',
    status: 'Usage: node pwman.mts status',
    help: `Usage:
    node pwman.mts init [--master <masterPassword>]
    node pwman.mts add <service> <username> <password> [--master <masterPassword>]
    node pwman.mts get <service> <username> [--master <masterPassword>]
    node pwman.mts del <service> <username> [--master <masterPassword>]
    node pwman.mts list [--asc service|username] [--desc service|username]
    node pwman.mts export <csvFilePath> [--master <masterPassword>]
    node pwman.mts import <csvFilePath> [--master <masterPassword>]
    node pwman.mts change-master [--old-master <oldMasterPassword>] [--new-master <newMasterPassword>]
    node pwman.mts status`,
  },

  // ------------------------
  // エラーメッセージ
  // ------------------------
  errors: {
    dbNotInitialized: 'Error: DB is not initialized. Please run init first.',
    dbAlreadyInitialized: 'Error: DB already initialized.',
    authFailed: 'Error: Authentication failed.',
    masterNotSet: 'Error: Master password not set.',
    invalidOldMaster: 'Error: invalid old master password.',
    pwMismatch: 'Error: new master passwords do not match.',
    emptyPassword: 'Error: Password cannot be empty.',
    entryNotFound: 'Error: Entry not found.',
    invalidImportFile: (line?: number, msg?: string) =>
      line
        ? `Error: invalid import file at line ${line}: ${msg ?? ''}`
        : `Error: invalid import file ${msg ?? ''}`,
    ioError: 'Error: I/O or DB error.',
    unknownOption: (opt: string) => `Error: unknown option ${opt}`,
    unexpectedArg: (arg: string) => `Error: unexpected argument ${arg}`,
    controlChar: 'Error: control characters are not allowed.',
    exportTargetDir: 'Error: export target must be a file path, not a directory.',
    exportDirNotExist: (dir: string) => `Error: output directory does not exist: ${dir}`,
    invalidImportLine: (line: number) => `Error: invalid import line at ${line}`,
    invalidImportFormat: 'Error: invalid import format',
    importFailed: 'Error: import failed',
    changeMasterFailed: 'Error: change-master failed',
  },

  // ------------------------
  // 成功・情報メッセージ
  // ------------------------
  infos: {
    dbInitialized: 'DB initialized.',
    entryAdded: (service: string, username: string) => `Added: ${service} ${username}`,
    entryDeleted: 'Deleted.',
    masterUnchanged: 'Info: master password unchanged.',
    masterChanged: 'Success: master password changed.',
    exportSuccess: (file: string) => `Success: Exported to ${file}`,
    importSuccess: (count: number) => `Success: imported ${count} records.`,
    initializedNo: 'Initialized: no',
    initializedYes: 'Initialized: yes',
    NoData: 'No data.',
  },

  // ------------------------
  // プロンプト用メッセージ
  // ------------------------
  prompts: {
    enterMaster: 'Enter master password: ',
    enterNewMaster: 'Enter new master password: ',
    confirmNewMaster: 'Confirm new master password: ',
    enterOldMaster: 'Enter old master password: ',
  },
};
