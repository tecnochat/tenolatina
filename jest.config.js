/**
 * Configuración de Jest para TecnoBot SAAS
 */

export default {
  // Entorno de testing
  testEnvironment: 'node',
  
  // Soporte para ES modules
  preset: null,
  extensionsToTreatAsEsm: ['.js'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Transformaciones
  transform: {},
  
  // Patrones de archivos de test
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Directorios a ignorar
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/pruebaCrud/'
  ],
  
  // Archivos de setup
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  
  // Coverage
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__tests__/**',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/server.js',
    '!src/migrations/**'
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // Umbrales de coverage
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Variables de entorno para testing
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Timeout para tests
  testTimeout: 30000,
  
  // Configuración de módulos
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1'
  },
  
  // Configuración para tests de integración
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/src/**/*.integration.test.js']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/src/**/*.integration.test.js'],
      setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration-setup.js']
    }
  ],
  
  // Configuración de reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage',
        outputName: 'junit.xml'
      }
    ]
  ],
  
  // Configuración para watch mode
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Configuración de cache
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Configuración de verbose
  verbose: true,
  
  // Configuración para detectar archivos abiertos
  detectOpenHandles: true,
  
  // Configuración para forzar salida
  forceExit: true,
  
  // Configuración de clear mocks
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true
};