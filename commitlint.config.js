// Settings inspired by https://medium.com/neudesic-innovation/conventional-commits-a-better-way-78d6785c2e08
module.exports = {
  extends: ['@commitlint/config-conventional'],

  rules: {
    'body-case': [2, 'always', 'sentence-case'],
    'body-max-line-length': [1, 'always', 72],
    'header-max-length': [1, 'always', 52],
    'scope-enum': [
      2,
      'always',
      ['deps-dev', 'github', 'platform', 'accessory'],
    ],
    'type-enum': [
      2,
      'always',
      [
        'build',
        'change',
        'chore',
        'ci',
        'deprecate',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'remove',
        'revert',
        'security',
        'style',
        'test',
      ],
    ],
  },
};
