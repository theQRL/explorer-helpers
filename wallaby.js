console.log('Node version used by wallaby', process.version);
module.exports = function (wallaby) {
  process.env.npm_package_version = '2.8.1';
  return {
    files: ['index.js'],
    tests: ['test/test.js'],
    testFramework: 'mocha',
    compilers: {
      '**/*.js': wallaby.compilers.babel(),
    },
    env: {
      type: 'node',
    },
  };
};
