module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    parser: "@typescript-eslint/parser",
    sourceType: "module",
    tsconfigRootDir: __dirname,
  },
  extends: [
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:vue/vue3-recommended",
    "prettier",
  ],
  plugins: ["frontmatter", "@typescript-eslint", "prettier-vue"],
  rules: {
    "no-console": process.env.NODE_ENV === "production" ? "error" : "off",
    "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn"],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
  },
  overrides: [
    {
      files: ["*.md"],
      parser: "markdown-eslint-parser",
      extends: ["plugin:prettier/recommended", "plugin:md/recommended"],
      rules: {
        "prettier/prettier": ["error", { parser: "markdown" }],
      },
    },
    {
      files: ["*.vue"],
      extends: [
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:vue/vue3-recommended",
        "plugin:prettier-vue/recommended",
        "prettier",
      ],
      rules: {
        "no-console": process.env.NODE_ENV === "production" ? "error" : "off",
        "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off",
        "vue/script-setup-uses-vars": "error",
        "vue/multi-word-component-names": "off",
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": ["warn"],

        "vue/v-on-event-hyphenation": [
          "error",
          "never",
          {
            autofix: true,
          },
        ],
        "vue/attribute-hyphenation": ["error", "never"],
      },
    },
  ],
};
