/**
 * キー文字列から user と method を取り出す
 */
export function splitUserMethodKey(key: string): { user: string; method: string } {
    const [user, method] = key.split('\t');
    return { user, method };
}


/**
 * 右パディングで文字列を揃える
 */
export function padRight(value: string, length: number): string {
    if (value.length >= length) return value;
    return value + ' '.repeat(length - value.length);
}

/**
 * topN 抽出関数
 * items: 対象配列
 * n: 抽出件数
 * compare: 比較関数 (a, b) => number
 * 返却値: 抽出された上位 n 件の配列（降順）
 * NOTE：大規模なデータセットで効率的。多分
 * 今回はパフォーマンス比較の結果、
 * 全件ソートの方が速かったため参照していません
 */
// パフォーマンス比較:
// time=8214.625ms rss=107.28MiB → time=8418.448ms rss=124.61MiB
export function getTopN<T>(items: T[], n: number, compare: (a: T, b: T) => number): T[] {
    const heap: T[] = [];

    function heapPush(item: T) {
        heap.push(item);
        let i = heap.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (compare(heap[i], heap[p]) >= 0) break;
            [heap[i], heap[p]] = [heap[p], heap[i]];
            i = p;
        }
    }

    function heapPop() {
        const top = heap[0];
        const x = heap.pop()!;
        if (heap.length > 0) {
            heap[0] = x;
            let i = 0;
            while (true) {
                const l = i * 2 + 1;
                const r = i * 2 + 2;
                if (l >= heap.length) break;
                const c = r < heap.length && compare(heap[r], heap[l]) < 0 ? r : l;
                if (compare(heap[c], heap[i]) >= 0) break;
                [heap[i], heap[c]] = [heap[c], heap[i]];
                i = c;
            }
        }
        return top;
    }

    for (const item of items) {
        if (heap.length < n) {
            heapPush(item);
        } else if (compare(item, heap[0]) > 0) {
            heapPop();
            heapPush(item);
        }
    }

    // 降順で返す
    const res = [];
    while (heap.length > 0) res.push(heapPop());
    return res.reverse();
}


/**
 * パフォーマンス計測結果を表示
 */
export function printPerformance(startTimeNs: bigint): void {
    const endTimeNs = process.hrtime.bigint();
    const elapsedMs = Number(endTimeNs - startTimeNs) / 1_000_000; // ns → ms
    const usage = process.resourceUsage();
    const rssMiB = usage.maxRSS / 1024; // KiB → MiB
    console.log(`Performance: time=${elapsedMs.toFixed(3)}ms rss=${rssMiB.toFixed(2)}MiB`);
}
