module.exports = {
  extends: [
    'airbnb-base',
    'plugin:jest/recommended'
  ],
  env: {
    node: true,
    jest: true,
    es2021: true
  },
  rules: {
    'no-console': 'warn',
    'no-unused-vars': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-arrow-callback': 'error',
    'max-len': ['error', {
      code: 120,
      ignoreComments: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true
    }],
    'comma-dangle': ['error', 'never'],
    'indent': ['error', 4],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always']
  }
};
