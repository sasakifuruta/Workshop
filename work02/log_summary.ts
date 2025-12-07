#!/usr/bin/env node
// 可搬性のためシバンを追加
'use strict';


// モジュールのインポート
import fs from 'fs';
import { UsageError, handleAppError } from './lib/error.ts';
import { 
    printAuthSuccesses,
    printAuthFailures,
    printAuthFailuresByIp 
} from './services/authStats.ts';
import { processLogFile } from './services/logProcessor.ts';
import type { Stats } from './services/authStats.ts';
import { printPerformance } from './lib/util.ts';


// =============================
// メイン処理
// =============================
async function main(): Promise<void> {
    const startTimeNs = process.hrtime.bigint();
    try {
        // コマンドライン引数の処理
        const args = process.argv.slice(2);
        if (args.length !== 1) {
            throw new UsageError('Usage: node log_summary.ts <logfile.gz>');
        }

        // 入力ファイルの存在確認
        const logFile = args[0];
        if (!fs.existsSync(logFile)) {
            throw new UsageError(`Input file not found: ${logFile}`);
        }

        // 統計情報オブジェクトの初期化
        const stats: Stats = {
            successCounts: {},
            failureCountsUserMethod: {},
            failureCountsByIp: {},
            totalFailures: 0,
        };

        // ログファイルの処理
        await processLogFile(logFile, stats);

        // 集計結果の表示
        printAuthSuccesses(stats);
        console.log();
        printAuthFailures(stats);
        console.log();
        printAuthFailuresByIp(stats);
        console.log();

        // パフォーマンス計測結果の表示
        printPerformance(startTimeNs);
    } catch (err: any) {
        handleAppError(err);
    }
}


// メイン実行
main();