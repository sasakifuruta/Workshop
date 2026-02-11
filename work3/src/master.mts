import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { deriveKey, hashDerivedKey } from './credentialCrypto.mts';
import { askPassword } from './utils.mts';
import { exitWith, ExitCode } from './exitHandler.mts';
import { Messages } from './messages.mts';

/**
 * ========================
 * Master password
 * ========================
 */
export function verifyMasterPassword(inputPw: string, db: DatabaseSync): boolean {
  const row = db.prepare(`SELECT password_hash, salt FROM master WHERE id = 1`)
                .get() as { password_hash: string; salt: string } | undefined;
  if (!row) exitWith(ExitCode.GENERAL_ERROR, Messages.errors.masterNotSet);

  const key = deriveKey(inputPw, row.salt);
  const hash = hashDerivedKey(key);

  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(row.password_hash, 'hex'));
}

// export async function getMasterPassword(argValue?: string): Promise<string> {
//   return argValue ?? await askPassword(Messages.prompts.enterMaster);
// }
export async function getMasterPassword(args: string[], argIndex: number): Promise<string> {
  if (args[argIndex] === '--master' && args[argIndex + 1]) {
    return args[argIndex + 1];
  }
  return askPassword(Messages.prompts.enterMaster);
}

export async function askNewMasterWithConfirm(): Promise<string> {
  const pw1 = await askPassword(Messages.prompts.enterNewMaster);
  const pw2 = await askPassword(Messages.prompts.confirmNewMaster);
  if (pw1 !== pw2) exitWith(ExitCode.USAGE_ERROR, Messages.errors.pwMismatch);
  return pw1;
}

export function getMasterSalt(db: DatabaseSync): string {
  const row = db.prepare(`SELECT salt FROM master WHERE id = 1`).get() as { salt: string } | undefined;
  if (!row) exitWith(ExitCode.GENERAL_ERROR, Messages.errors.masterNotSet);
  return row.salt;
}
