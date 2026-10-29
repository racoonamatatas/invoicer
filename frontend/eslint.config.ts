import { globalIgnores } from 'eslint/config';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import pluginVitest from '@vitest/eslint-plugin';
import pluginOxlint from 'eslint-plugin-oxlint';
import stylistic from '@stylistic/eslint-plugin';

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
    {
        name: 'app/files-to-lint',
        files: ['**/*.{vue,ts,mts,tsx}'],
    },

    globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

    ...pluginVue.configs['flat/essential'],
    vueTsConfigs.recommended,

    {
        ...pluginVitest.configs.recommended,
        files: ['tests/**/*'],
    },

    {
        name: 'app/style',
        plugins: { '@stylistic': stylistic },
        rules: {
            '@stylistic/brace-style': ['error', 'allman'],
            '@stylistic/indent': ['error', 4],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
            '@stylistic/no-trailing-spaces': 'error',
            'vue/html-indent': ['error', 4],
            // `const { id: _id, ...rest } = x` is how a key is left out of a
            // copy; the named sibling is there to be dropped, not used.
            '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],

        },
    },

    {
        name: 'app/pages',
        // Pages are only loaded by the router, never used as tags, so they can't
        // clash with HTML elements; the folder already says "page".
        files: ['src/domains/*/pages/**/*.vue'],
        rules: { 'vue/multi-word-component-names': 'off' },
    },

    ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
);
