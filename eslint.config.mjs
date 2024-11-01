import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/dist", "**/commitlint.config.js"],
}, ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
), {
    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2018,
        sourceType: "module",
    },

    rules: {
        quotes: ["warn", "single"],

        indent: ["warn", 2, {
            SwitchCase: 1,
        }],

        "linebreak-style": ["warn", "unix"],
        semi: ["warn", "always"],
        "comma-dangle": ["warn", "always-multiline"],
        "dot-notation": "warn",
        eqeqeq: "warn",
        curly: ["warn", "all"],
        "brace-style": ["warn"],
        "prefer-arrow-callback": ["warn"],
        "max-len": ["warn", 140],
        "no-console": ["warn"],

        "lines-between-class-members": ["warn", "always", {
            exceptAfterSingleLine: true,
        }],

        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-require-imports": "warn",
    },
}];