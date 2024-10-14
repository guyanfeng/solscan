module.exports = {
    // 设置全局超时时间为10秒（10000毫秒）
    testTimeout: 10000, 
    // 指定测试环境
    testEnvironment: 'node',
  
    // 转换设置，用于将 TypeScript 转换为可在 Node.js 中执行的 JavaScript
    transform: {
      '^.+\\.tsx?$': 'ts-jest',
    },
  
    // 测试文件的匹配模式
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  
    // 模块文件扩展名
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
    // 覆盖率报告的配置
    collectCoverage: false,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
  
    // 配置模块路径映射，与 tsconfig.json 中的路径映射相匹配
    moduleNameMapper: {
      '^@src/(.*)$': '<rootDir>/src/$1',
      '^@utils/(.*)$': '<rootDir>/utils/$1'
    },
  
    // 忽略的文件或目录
    testPathIgnorePatterns: ['/node_modules/','/src/']
  };
  
  