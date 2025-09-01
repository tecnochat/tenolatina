/**
 * Configuración global para tests unitarios
 * TecnoBot SAAS
 */

import { jest } from '@jest/globals';
import dotenv from 'dotenv';

// Cargar variables de entorno de test
dotenv.config({ path: '.env.test' });

// Configurar variables de entorno para testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.LOG_LEVEL = 'error'; // Reducir logs en tests

// Mock de console para tests más limpios
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock de setTimeout y setInterval para tests más rápidos
jest.useFakeTimers();

// Configuración global de timeouts
jest.setTimeout(30000);

// Mock de Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getUser: jest.fn(),
      refreshSession: jest.fn()
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      limit: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis()
    })),
    rpc: jest.fn()
  }))
}));

// Mock de OpenAI
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Respuesta de prueba de OpenAI'
              }
            }]
          })
        }
      }
    }))
  };
});

// Mock de Baileys
jest.mock('@whiskeysockets/baileys', () => ({
  default: jest.fn(),
  useMultiFileAuthState: jest.fn(),
  DisconnectReason: {
    loggedOut: 'logged_out',
    connectionClosed: 'connection_closed',
    connectionLost: 'connection_lost',
    connectionReplaced: 'connection_replaced',
    timedOut: 'timed_out',
    badSession: 'bad_session'
  },
  ConnectionState: {
    close: 'close',
    connecting: 'connecting',
    open: 'open'
  }
}));

// Mock de node-cache
jest.mock('node-cache', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    has: jest.fn(),
    keys: jest.fn(),
    flushAll: jest.fn()
  }));
});

// Utilidades de testing
global.testUtils = {
  // Crear un usuario de prueba
  createTestUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    tenantId: 'test-tenant-id',
    role: 'tenant_admin',
    plan: 'free',
    isActive: true,
    createdAt: new Date().toISOString()
  }),

  // Crear un tenant de prueba
  createTestTenant: () => ({
    id: 'test-tenant-id',
    name: 'Test Company',
    plan: 'free',
    isActive: true,
    createdAt: new Date().toISOString(),
    settings: {
      maxChatbots: 1,
      maxMonthlyMessages: 1000,
      maxWhatsappSessions: 1,
      maxTeamMembers: 1
    }
  }),

  // Crear un chatbot de prueba
  createTestChatbot: () => ({
    id: 'test-chatbot-id',
    name: 'Test Chatbot',
    description: 'Chatbot de prueba',
    tenantId: 'test-tenant-id',
    isActive: true,
    config: {
      aiEnabled: true,
      welcomeEnabled: true,
      maxResponseTime: 30000
    },
    createdAt: new Date().toISOString()
  }),

  // Crear un token JWT de prueba
  createTestJWT: () => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJ0ZW5hbnRJZCI6InRlc3QtdGVuYW50LWlkIiwicm9sZSI6InRlbmFudF9hZG1pbiIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxNjQxNjAwMDAwfQ.test-signature',

  // Limpiar mocks
  clearAllMocks: () => {
    jest.clearAllMocks();
  },

  // Esperar por promesas pendientes
  flushPromises: () => new Promise(resolve => setImmediate(resolve))
};

// Cleanup después de cada test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Cleanup después de todos los tests
afterAll(() => {
  jest.restoreAllMocks();
});