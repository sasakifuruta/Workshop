// ===============================================================
// calc.mjs — Generator対応版（完全動作）
// ===============================================================
class Calculator {
    constructor() {
        // -----------------------------
        // 演算子定義：優先度と種類
        // -----------------------------
        this.OPERATORS = {
            "+": { precedence: 1, type: "binary" },
            "-": { precedence: 1, type: "binary" },
            "*": { precedence: 2, type: "binary" },
            "/": { precedence: 2, type: "binary" },
        };

        this.UNARY_OPERATORS = ["+", "-"];
        this.UNSUPPORTED_PATTERNS = [
            /[%^]/, /e[+-]?\d+/i, /\./, /[a-zA-Z_]/, /[^\d+\-*/() \t]/,
        ];

        this.ERROR = {
            PARAM: 1, SYNTAX: 2, ARITH: 3,
        };

        this.tokens = [];
        this.pos = 0;
    }

    // ===============================================================
    // メイン処理：電卓実行
    // ===============================================================
    run() {
        try {
            const expr = this.getInput();
            const tokens = this.tokenize(expr);
            const ast = this.parse(tokens);

            // 🧭 通常モード or ステップモード切り替え
            if (process.env.STEP_MODE === "1") {
                console.log("=== ステップ実行開始 ===");
                const gen = this.evaluateGenerator(ast);
                for (const step of gen) {
                    console.log("中間結果:", step);
                }
                console.log("=== 完了 ===");
            } else {
                const result = this.evaluate(ast);
                this.output(result);
            }

        } catch (err) {
            console.error(err.message);
            process.exit(err.code || 1);
        }
    }

    // ===============================================================
    // 入力取得
    // ===============================================================
    getInput() {
        const expr = process.argv.slice(2).join(" ");
        if (!expr.trim()) {
            this.fail("パラメータエラー: 式が指定されていません", this.ERROR.PARAM);
        }
        return expr.trim();
    }

    // ===============================================================
    // トークン化
    // ===============================================================
    tokenize(expr) {
        for (const pattern of this.UNSUPPORTED_PATTERNS) {
            if (pattern.test(expr)) {
                this.fail("構文エラー: サポート外の文字・構文を検出", this.ERROR.SYNTAX);
            }
        }

        const tokens = [];
        let currentNumber = "";
        let parenDepth = 0;

        for (const ch of expr) {
            if (ch === " ") continue;
            if (/[0-9]/.test(ch)) {
                currentNumber += ch;
                continue;
            }

            if (currentNumber) {
                const value = Number(currentNumber);
                if (!Number.isSafeInteger(value)) {
                    this.fail("算術エラー: 安全整数範囲外", this.ERROR.ARITH);
                }
                tokens.push({ type: "number", value });
                currentNumber = "";
            }

            if (this.OPERATORS[ch]) {
                tokens.push({ type: "operator", value: ch });
                continue;
            }

            if (/[()]/.test(ch)) {
                tokens.push({ type: "paren", value: ch });
                parenDepth += ch === "(" ? 1 : -1;
                if (parenDepth < 0) {
                    this.fail("構文エラー: 括弧の対応が不正です", this.ERROR.SYNTAX);
                }
                continue;
            }

            this.fail(`構文エラー: 不正な文字「${ch}」`, this.ERROR.SYNTAX);
        }

        if (currentNumber) {
            tokens.push({ type: "number", value: Number(currentNumber) });
        }

        if (parenDepth !== 0) {
            this.fail("構文エラー: 括弧の対応が不正です", this.ERROR.SYNTAX);
        }

        return tokens;
    }

    // ===============================================================
    // 構文解析（優先度対応）
    // ===============================================================
    parse(tokens) {
        this.tokens = tokens;
        this.pos = 0;
        const ast = this.parseExpression();
        if (this.pos < this.tokens.length) {
            this.fail("構文エラー: 不要なトークンがあります", this.ERROR.SYNTAX);
        }
        return ast;
    }

    parseExpression(minPrecedence = 0) {
        let left = this.parseFactor();
        while (true) {
            const token = this.peek();
            if (!token || token.type !== "operator") break;

            const opInfo = this.OPERATORS[token.value];
            if (!opInfo || opInfo.precedence < minPrecedence) break;

            const operator = token.value;
            const precedence = opInfo.precedence;
            this.advance();

            const right = this.parseExpression(precedence + 1);
            left = { type: "binary", operator, left, right };
        }
        return left;
    }

    parseFactor() {
        if (this.match("+") || this.match("-")) {
            const operator = this.previous().value;
            const right = this.parseFactor();
            return { type: "unary", operator, right };
        }

        if (this.match("(")) {
            const expr = this.parseExpression();
            if (!this.match(")")) {
                this.fail("構文エラー: 括弧の閉じ忘れ", this.ERROR.SYNTAX);
            }
            return expr;
        }

        const token = this.peek();
        if (token && token.type === "number") {
            this.advance();
            return { type: "number", value: token.value };
        }

        this.fail("構文エラー: 予期しないトークン", this.ERROR.SYNTAX);
    }

    // ===============================================================
    // AST評価（通常版）: ジェネレータを即完走
    // ===============================================================
    evaluate(node) {
        let last;
        for (const val of this.evaluateGenerator(node)) {
            last = val;
        }
        return last;
    }

    // ===============================================================
    // AST評価（ジェネレータ版）: 途中経過を逐次yield
    // ===============================================================
    *evaluateGenerator(node) {
        switch (node.type) {
            case "number":
                yield node.value;
                return node.value;

            case "unary": {
                const val = yield* this.evaluateGenerator(node.right);
                const result = node.operator === "-" ? -val : +val;
                yield result;
                return result;
            }

            case "binary": {
                const left = yield* this.evaluateGenerator(node.left);
                const right = yield* this.evaluateGenerator(node.right);

                if (node.operator === "/" && right === 0) {
                    this.fail("算術エラー: ゼロ除算", this.ERROR.ARITH);
                }

                let result;
                switch (node.operator) {
                    case "+": result = left + right; break;
                    case "-": result = left - right; break;
                    case "*": result = left * right; break;
                    case "/": result = Math.trunc(left / right); break;
                }

                if (!Number.isSafeInteger(result)) {
                    this.fail("算術エラー: 安全整数範囲外", this.ERROR.ARITH);
                }

                yield result;
                return result;
            }

            default:
                this.fail("算術エラー: 不明なノード", this.ERROR.ARITH);
        }
    }

    // ===============================================================
    // 出力
    // ===============================================================
    output(result) {
        console.log(Object.is(result, -0) ? 0 : result);
    }

    // ===============================================================
    // パーサ補助関数
    // ===============================================================
    match(value) {
        const token = this.peek();
        if (token && token.value === value) {
            this.advance();
            return true;
        }
        return false;
    }

    peek() { return this.tokens[this.pos]; }
    previous() { return this.tokens[this.pos - 1]; }
    advance() { this.pos++; }

    fail(message, code) {
        const err = new Error(message);
        err.code = code;
        throw err;
    }
}

// ===============================================================
// 実行
// ===============================================================
new Calculator().run();
