// 認証メソッドの種類
export type AuthMethod = 'publickey' | 'password';


// 認証成否
export type AuthResult = 'success' | 'failure';


// 1行の認証ログから抜き出した情報
export interface AuthInfo {
    result: AuthResult;
    user: string;
    method: AuthMethod;
    ip?: string; // 失敗時にIP集計で利用
}


// 成功/失敗ログをまとめた正規表現
const AUTH_REGEX =
    /sshd(?:\[\d+\])?:\s+(?:Accepted (publickey|password) for (\S+) from (\S+)|Failed password for (?:invalid user )?(\S+) from (\S+))/


/**
 * 1行のログから sshd の認証情報をパースする
 * 対象:
 *   Accepted publickey for USER from IP ...
 *   Accepted password for USER from IP ...
 *   Failed  password for USER from IP ...
 *   Failed  password for invalid user USER from IP ...
 *
 * フォーマット不一致は null を返す
 */
export function parseAuthLine(line: string): AuthInfo | null {
    // sshd 以外のログは早期リターン
    // includes と　indexOf でパフォーマンス比較したが大差なし
    if (!line.includes('sshd')) {
        return null;
    }

    // 成功/失敗ログをまとめた正規表現
    // NOTE:２回に分けるより１回の方が0.08秒ほど速かった
    const match = AUTH_REGEX.exec(line);

    if (!match) return null;

    // Accepted
    if (match[1]) {
        return {
            result: 'success',
            user: match[2],
            method: match[1] as AuthMethod,
            ip: match[3],
        };
    }

    // Failed
    if (match[4]) {
        return {
            result: 'failure',
            user: match[4],
            method: 'password',
            ip: match[5],
        };
    }

    return null;
}
