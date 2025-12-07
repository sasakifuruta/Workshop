import type { AuthInfo } from '../lib/parse_auth_line.ts';
import { padRight, splitUserMethodKey, getTopN } from '../lib/util.ts';


// 統計全体をまとめて持つ構造体
/**
 * NOTE:
 * Map ではなくオブジェクトを使用し効率化
 * パフォーマンス比較:
 * Map版time=9985.858ms rss=122.73MiB 
 * → オブジェクト版time=9905.029ms rss=122.13MiB
 */
export interface Stats {
    successCounts: { [key: string]: number };        // key: "user\tmethod"
    failureCountsUserMethod: { [key: string]: number };
    failureCountsByIp: { [ip: string]: number };
    totalFailures: number;
}


/**
 * Map のカウンタを 1 増やすユーティリティ
 */
export function incrementMap(map: { [key: string]: number }, key: string): void {
    map[key] = (map[key] || 0) + 1;
}


/**
 * "user\tmethod" 形式でキーを作成
 */
export function makeUserMethodKey(user: string, method: string): string {
    return `${user}\t${method}`;
}


/**
 * 統計情報を更新する
 */
export function updateStats(stats: Stats, info: AuthInfo): void {
    const key = makeUserMethodKey(info.user, info.method);

    if (info.result === 'success') {
        incrementMap(stats.successCounts, key);
    } else {
        incrementMap(stats.failureCountsUserMethod, key);
        stats.totalFailures += 1;

        if (info.ip) {
            incrementMap(stats.failureCountsByIp, info.ip);
        }
    }
}


/**
 * 認証成功の集計結果を表示する（全件）
 */
export function printAuthSuccesses(stats: Stats): void {
    type Row = { user: string; method: string; count: number };
    const rows: Row[] = [];

    for (const key in stats.successCounts) {
        const count = stats.successCounts[key];
        const { user, method } = splitUserMethodKey(key);
        rows.push({ user, method, count });
    }

    rows.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count; // 成功数 降順
        if (a.user !== b.user) return a.user.localeCompare(b.user); // ユーザー 昇順
        return a.method.localeCompare(b.method); // メソッド 昇順
    });

    console.log('Authentication successes (all):');
    console.log('  User       Method      Success');
    console.log('  ------------------------------');

    for (const row of rows) {
        console.log(
            `  ${padRight(row.user, 10)} ${padRight(row.method, 10)} ${row.count}`
        );
    }
}


/**
 * 認証失敗の集計結果を表示する（上位10件）
 */
export function printAuthFailures(stats: Stats): void {
    type Row = { user: string; method: string; count: number };
    const rows: Row[] = [];

    for (const key in stats.failureCountsUserMethod) {
        const count = stats.failureCountsUserMethod[key];
        const { user, method } = splitUserMethodKey(key);
        rows.push({ user, method, count });
    }

    // 全件ソートしてから上位10件を抽出
    rows.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count; // 失敗数 降順
        if (a.user !== b.user) return a.user.localeCompare(b.user); // ユーザー 昇順
        return a.method.localeCompare(b.method); // メソッド 昇順
    });
    const top10 = rows.slice(0, 10);

    // ==================================================
    // min-heap を使った 上位10件 抽出（学習目的で実装）
    // const top10 = getTopN(rows, 10, (a, b) => {
    //     // 失敗数の降順
    //     if (a.count !== b.count) return a.count - b.count;
    //     // 失敗数が同じ場合、ユーザー名昇順
    //     if (a.user !== b.user) return a.user.localeCompare(b.user);
    //     // ユーザー名も同じ場合、メソッド昇順
    //     return a.method.localeCompare(b.method);
    // });
    // ======================================================

    console.log('Authentication failures (top 10):');
    console.log('  User       Method      Failure');
    console.log('  ------------------------------');

    for (const row of top10) {
        console.log(
            `  ${padRight(row.user, 10)} ${padRight(row.method, 10)} ${row.count}`
        );
    }

    console.log();
    console.log(`Total authentication failures: ${stats.totalFailures}`);
}


/**
 * IPごとの認証失敗数を表示する（上位10件）
 */
export function printAuthFailuresByIp(stats: Stats): void {
    type Row = { ip: string; count: number };
    const rows: Row[] = [];

    for (const ip in stats.failureCountsByIp) {
        const count = stats.failureCountsByIp[ip];
        rows.push({ ip, count });
    }

    // 全件ソートしてから上位10件を抽出
    rows.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count; // 失敗数 降順
        return a.ip.localeCompare(b.ip); // IP 昇順
    });
    const top10 = rows.slice(0, 10);

    // ==================================================
    // min-heap を使った 上位10件 抽出（学習目的で実装）
    // const top10 = getTopN(rows, 10, (a, b) => {
    //     // 失敗数の降順
    //     if (a.count !== b.count) return a.count - b.count;
    //     // 失敗数が同じ場合、IP昇順
    //     return a.ip.localeCompare(b.ip);
    // });
    // =====================================================

    console.log('Authentication failures by IP (top 10):');
    console.log('  IP                 Failure');
    console.log('  -------------------------');

    for (const row of top10) {
        console.log(`  ${padRight(row.ip, 18)} ${row.count}`);
    }
}
