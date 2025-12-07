// アプリケーションエラー用クラス
export class AppError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AppError';
    }
}


// 入力エラー用クラス
export class UsageError extends AppError {
    constructor(message: string) {
        super(message);
        this.name = 'UsageError';
    }
}


// エラーハンドリング関数
export function handleAppError(err: unknown): void {
    if (err instanceof UsageError) {
        console.error(err.message);
        process.exit(1);
    }

    if (err instanceof AppError) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }

    // 予期しない例外
    console.error('Unexpected error:', err);
    process.exit(1);
}
