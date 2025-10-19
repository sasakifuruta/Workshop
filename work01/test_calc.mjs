import assert from "node:assert";
import { exec as execBase } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execBase);
const args = process.argv.slice(2);
let passed = 0;
let failed = 0;

async function run(command) {
  let code = 0;
  let stdout = null;
  let stderr = null;

  try {
    ({ stdout, stderr } = await exec(command));
  } catch (error) {
    ({ code, stdout, stderr } = error);
  }

  return { code, stdout, stderr };
}

async function validate(
  command,
  expected = { success: null, stdout: null, stderr: null, exitCode: null }
) {
  const { code, stdout, stderr } = await run(command);
  const message = `NG: ${command} => \ncode: ${code}\nstdout: ${stdout.trim()}\nstderr: ${stderr.trim()}`;

  try {
    if (expected.success != null) {
      if (expected.success) {
        assert.equal(code, 0, message);
      } else {
        assert.notEqual(code, 0, message);
      }
    }
    if (expected.stdout != null)
      assert.equal(stdout.trim(), expected.stdout, message);
    if (expected.stderr != null)
      assert.equal(stderr.trim(), expected.stderr, message);
    if (expected.exitCode != null)
      assert.equal(code, expected.exitCode, message);
    passed++;
  } catch (e) {
    const line = e.stack
      .split("\n")
      .at(-2)
      .match(/^.+:(?<line>\d+):.+?$/).groups["line"];
    console.error(`line: ${line}\n${e.message}`);
    console.error(
      `expected: ${JSON.stringify(
        Object.fromEntries(
          Object.entries(expected).filter(([_, v]) => v !== null)
        )
      )}`
    );
    console.error(`${"= ".repeat(20)}`);
    failed++;
  }
}

async function ok(
  command,
  expectedStdout,
  expectedExitCode = null,
  expectedStderr = null
) {
  await validate(command, {
    success: true,
    exitCode: expectedExitCode,
    stdout: expectedStdout,
    stderr: expectedStderr,
  });
}

async function ng(
  command,
  expectedStderr = null,
  expectedExitCode = null,
  expectedStdout = null
) {
  await validate(command, {
    success: false,
    exitCode: expectedExitCode,
    stdout: expectedStdout,
    stderr: expectedStderr,
  });
}

async function test(program) {
  /** 正常系 **/
  // 加算
  await ok(`${program} "6 + 2"`, "8");
  // 減算
  await ok(`${program} "6 - 2"`, "4");
  // 乗算
  await ok(`${program} "6 * 2"`, "12");
  // 除算
  await ok(`${program} "6 / 2"`, "3");
  // 単項演算子
  await ok(`${program} +6 + +2`, "8");
  await ok(`${program} -6 - -2`, "-4");
  await ok(`${program} --1 + ++2`, "3");
  await ok(`${program} +++++1`, "1");
  await ok(`${program} -----1`, "-1");
  await ok(`${program} -+-+-1`, "-1");
  // 括弧
  await ok(`${program} "6 - (2 - 1)"`, "5");
  await ok(`${program} "(1) + 2"`, "3");
  await ok(`${program} "3 - (-4)"`, "7");
  await ok(`${program} "((5 + 6))"`, "11");
  // 二項演算子なし
  await ok(`${program} "1"`, "1");
  await ok(`${program} "-1"`, "-1");
  await ok(`${program} "-(1)"`, "-1");
  await ok(`${program} "-(-1)"`, "1");
  // 優先順位
  await ok(`${program} "6 + 5 - 4 * +3 / -2"`, "17");
  // 左結合
  await ok(`${program} "6 - 2 - 1"`, "3");
  // 0方向丸め
  await ok(`${program} "7 / 3 * 3"`, "6");
  await ok(`${program} "1 / 2 * 4"`, "0");
  await ok(`${program} "-7 / 3"`, "-2");
  // +の省略
  await ok(`${program} "+1 / 2"`, "0");
  await ok(`${program} "+1"`, "1");
  await ok(`${program} "+(1)"`, "1");
  await ok(`${program} "(+1)"`, "1");
  await ok(`${program} "+0"`, "0");
  // -0の正規化
  await ok(`${program} "-1 / 2"`, "0");
  await ok(`${program} "-0"`, "0");
  await ok(`${program} "-(0)"`, "0");
  await ok(`${program} "(-0)"`, "0");
  await ok(`${program} "-(-0)"`, "0");
  // 半角スペース無視
  await ok(`${program} "-  6  +  +  2"`, "-4");
  // 複合
  await ok(`${program} "6 + 5 - 4 * (  (  -3 / -2  ) + -1  )"`, "11");
  await ok(`${program} "-(1 - 2)"`, "1");
  await ok(`${program} "3 - -(1 + 2)"`, "6");
  await ok(`${program} "-+(+-+2)"`, "2");
  // 区切りなし
  await ok(`${program} "6+5-4*((-3/-2)+-1)"`, "11");
  // 安全整数範囲内
  await ok(
    `${program} ${Number.MAX_SAFE_INTEGER} - 1 + 1`,
    String(Number.MAX_SAFE_INTEGER)
  );
  await ok(
    `${program} ${Number.MIN_SAFE_INTEGER} + 1 - 1`,
    String(Number.MIN_SAFE_INTEGER)
  );

  /** 異常系 **/
  // パラメーターエラー
  await ng(`${program}`);
  // 構文エラー: サポート外トークン
  await ng(`${program} "2 ^ 3"`);
  await ng(`${program} "5 % 2"`);
  await ng(`${program} "1.2 + 3"`);
await ng(`${program} "1e3 + 1"`);
  await ng(`${program} "x + 1"`);
  await ng(`${program} "sin ( 1 )"`);
  await ng(`${program} "2 ( 3 )"`);
  await ng(`${program} "( 2 ) 3"`);
  await ng(`${program} "いちたすに"`);
  await ng(`${program} "1\t+2"`);
  // 構文エラー: 括弧不一致
  await ng(`${program} "( 1 + 2"`);
  await ng(`${program} "1 + 2 )"`);
  // 構文エラー: 演算子の並び不正
  await ng(`${program} "1 + 2 +"`);
  await ng(`${program} "* 2 + 3"`);
  await ng(`${program} "1 * / 2"`);
  // 算術エラー: ゼロ除算
  await ng(`${program} "1 / 0"`);
  await ng(`${program} "1 / ( 2 - 2 )"`);
  // 算術エラー: 安全整数範囲外
  await ng(`${program} "${Number.MAX_SAFE_INTEGER + 1} - 1"`);
  await ng(`${program} "${Number.MAX_SAFE_INTEGER} + 1"`);
  await ng(`${program} "${Number.MAX_SAFE_INTEGER} + 1 - 1"`);
  await ng(`${program} "${Number.MIN_SAFE_INTEGER - 1} + 1"`);
  await ng(`${program} "${Number.MIN_SAFE_INTEGER} - 1"`);
  await ng(`${program} "${Number.MIN_SAFE_INTEGER} - 1 + 1"`);
}

await test(`node ${args.join(" ")}`);
console.log(`passed: ${passed}, failed: ${failed}`);