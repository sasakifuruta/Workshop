import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

/**
 * ========================================
 * プロジェクトパス設定
 * ========================================
 */
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const pwmanPath = path.join(projectRoot, 'pwman.mts');
const DB_FILE = 'pwman.db';

/**
 * ========================================
 * CLI 実行ユーティリティ（非同期版）
 * ========================================
 */

/**
 * 外部プロセスとして pwman.mts を非同期実行
 * @param args CLI 引数配列
 * @param options spawn オプション
 * @returns {Promise<{ stdout: string; stderr: string; status: number | null }>}
 */
function runPwmanAsync(
  args: string[],
  options: { cwd?: string } = {}
): Promise<{ stdout: string; stderr: string; status: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [pwmanPath, ...args], {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (status) => {
      resolve({ stdout, stderr, status });
    });
  });
}

/**
 * ========================================
 * テスト用作業ディレクトリ
 * ========================================
 */

/**
 * 一時ディレクトリで処理を実行し、終了後に削除する
 * @param fn ディレクトリパスを受け取る非同期処理
 */
async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pwman-test-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * ========================================
 * テストケース
 * ========================================
 */

// --------------------
// 共通 / 引数チェック
// --------------------

test('No.5 コマンド未指定 → exit 2 & Usage 表示', async () => {
  const r = await runPwmanAsync([]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Usage/);
});

test('No.6 未知コマンド → exit 2', async () => {
  const r = await runPwmanAsync(['foo']);
  assert.notEqual(r.status, 0);
});

test('No.46 未知オプション → exit 2', async () => {
  const r = await runPwmanAsync(['--unknown']);
  assert.equal(r.status, 2);
});

test('No.47 引数過剰 → exit 2', async () => {
  const r = await runPwmanAsync(['init', 'a', 'b']);
  assert.equal(r.status, 2);
});

// --------------------
// init
// --------------------

test('No.1 init 初回実行 → DB作成 & exit 0', async () => {
  await withTempDir(async (dir) => {
    const r = await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    assert.equal(r.status, 0);

    const stat = await fs.stat(path.join(dir, DB_FILE));
    assert.ok(stat.isFile());
  });
});

test('No.2 init 再実行 → エラー & DB変更なし', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const before = await fs.stat(path.join(dir, DB_FILE));

    const r = await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const after = await fs.stat(path.join(dir, DB_FILE));

    assert.notEqual(r.status, 0);
    assert.equal(before.mtimeMs, after.mtimeMs);
  });
});

test('No.3 init PW未入力 → エラー & DB未作成', async () => {
  await withTempDir(async (dir) => {
    const r = await runPwmanAsync(['init', ''], { cwd: dir });
    assert.notEqual(r.status, 0);

    await assert.rejects(() => fs.stat(path.join(dir, DB_FILE)));
  });
});

// --------------------
// status
// --------------------

test('No.44 status init前 → エラー', async () => {
  await withTempDir(async (dir) => {
    const r = await runPwmanAsync(['status'], { cwd: dir });
    assert.notEqual(r.status, 0);
  });
});

test('No.43 status init後 → 件数 0', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['status'], { cwd: dir });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /0/);
  });
});

// --------------------
// add → list → get → del 最小ループ
// --------------------

test('No.10 add → list → get 最小ループ', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });

    const add = await runPwmanAsync(['add', 'serviceA', 'userA', 'passA', '--master', 'testpw'], { cwd: dir });
    assert.equal(add.status, 0);

    const list = await runPwmanAsync(['list'], { cwd: dir });
    assert.equal(list.status, 0);
    assert.match(list.stdout, /serviceA/);
    assert.match(list.stdout, /userA/);
    assert.doesNotMatch(list.stdout, /passA/);

    const get = await runPwmanAsync(['get', 'serviceA', 'userA', '--master', 'testpw'], { cwd: dir });
    assert.equal(get.status, 0);
    assert.match(get.stdout, /passA/);

    const del = await runPwmanAsync(['del', 'serviceA', 'userA', '--master', 'testpw'], { cwd: dir });
    assert.equal(del.status, 0);

    const listAfter = await runPwmanAsync(['list'], { cwd: dir });
    assert.doesNotMatch(listAfter.stdout, /serviceA/);
  });
});

// --------------------
// add 異常系
// --------------------

test('No.7 add 引数なし → exit 2', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['add'], { cwd: dir });
    assert.equal(r.status, 2);
  });
});

test('No.11 add init前 → エラー', async () => {
  await withTempDir(async (dir) => {
    const r = await runPwmanAsync(['add', 's', 'u', 'p'], { cwd: dir });
    assert.notEqual(r.status, 0);
  });
});

test('No.12 add 認証失敗 → 登録されない', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['add', 's', 'u', 'p', '--master', 'wrong'], { cwd: dir });
    assert.notEqual(r.status, 0);

    const list = await runPwmanAsync(['list'], { cwd: dir });
    assert.doesNotMatch(list.stdout, /s/);
  });
});

test('No.13 add 重複登録 → エラー', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 's', 'u', 'p', '--master', 'testpw'], { cwd: dir });

    const r = await runPwmanAsync(['add', 's', 'u', 'p2', '--master', 'testpw'], { cwd: dir });
    assert.notEqual(r.status, 0);
  });
});

test('No.14 add 引数不足 → exit 2', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['add', 's', 'u', '--master', 'testpw'], { cwd: dir });
    assert.equal(r.status, 2);
  });
});

// --------------------
// get 異常系
// --------------------

test('No.15 get 正常 → stdout に PW', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 's', 'u', 'p', '--master', 'testpw'], { cwd: dir });

    const r = await runPwmanAsync(['get', 's', 'u', '--master', 'testpw'], { cwd: dir });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /p/);
  });
});

test('No.16 get 認証失敗 → 表示されない', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 's', 'u', 'p', '--master', 'testpw'], { cwd: dir });

    const r = await runPwmanAsync(['get', 's', 'u', '--master', 'wrong'], { cwd: dir });
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('No.17 get 未存在 → エラー', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['get', 'nope', 'u', '--master', 'testpw'], { cwd: dir });
    assert.notEqual(r.status, 0);
  });
});

// --------------------
// del 異常系
// --------------------

test('No.9 del 引数なし → exit 2', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['del'], { cwd: dir });
    assert.equal(r.status, 2);
  });
});

test('No.20 del 未存在 → エラー', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['del', 'nope', 'u', '--master', 'testpw'], { cwd: dir });
    assert.notEqual(r.status, 0);
  });
});

test('No.21 del 認証失敗 → 削除されない', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 's', 'u', 'p', '--master', 'testpw'], { cwd: dir });

    await runPwmanAsync(['del', 's', 'u', '--master', 'wrong'], { cwd: dir });

    const list = await runPwmanAsync(['list'], { cwd: dir });
    assert.match(list.stdout, /s/);
  });
});

// --------------------
// list
// --------------------

test('No.22 list 正常 → service, username 表示', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 'b', 'u1', 'p1', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 'a', 'u2', 'p2', '--master', 'testpw'], { cwd: dir });

    const r = await runPwmanAsync(['list', '--master', 'testpw'], { cwd: dir });
    assert.match(r.stdout, /a/);
    assert.match(r.stdout, /b/);
    assert.match(r.stdout, /u1/);
    assert.doesNotMatch(r.stdout, /p1/);
  });
});

test('No.23 list デフォルト昇順', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 'b', 'u', 'p', '--master', 'testpw'], { cwd: dir });
    await runPwmanAsync(['add', 'a', 'u', 'p', '--master', 'testpw'], { cwd: dir });

    const r = await runPwmanAsync(['list'], { cwd: dir });
    assert.ok(r.stdout.indexOf('a') < r.stdout.indexOf('b'));
  });
});

test('No.24 list 不正ソート → exit 2', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['list', '--asc', 'foo'], { cwd: dir });
    assert.equal(r.status, 2);
  });
});

// --------------------
// help / security / exit code
// --------------------

test('No.45 help → Usage 表示', async () => {
  const r = await runPwmanAsync(['help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage/);
});

test('No.49 エラー時ログに秘密情報なし', async () => {
  await withTempDir(async (dir) => {
    await runPwmanAsync(['init', '--master', 'testpw'], { cwd: dir });
    const r = await runPwmanAsync(['get', 'nope', 'u', '--master', 'testpw'], { cwd: dir });
    assert.doesNotMatch(r.stderr ?? '', /pass|password|pw/i);
  });
});

test('No.50 exit code 仕様', async () => {
  const r = await runPwmanAsync(['add']);
  assert.equal(r.status, 2);
});
