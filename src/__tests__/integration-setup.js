/**
 * Configuración para tests de integración
 * TecnoBot SAAS
 */

import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import request from 'supertest';

// Cargar variables de entorno específicas para integración
dotenv.config({ path: '.env.integration' });

// Configurar variables de entorno para tests de integración
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // Puerto diferente para tests
process.env.JWT_SECRET = 'integration-test-jwt-secret';
process.env.LOG_LEVEL = 'error';

// Configuración de base de datos de test
process.env.SUPABASE_URL = process.env.SUPABASE_TEST_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || 'test-service-role-key';

// Configuración de servicios externos para tests
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GOOGLE_API_KEY = 'test-google-key';

// Configuración de rate limiting más permisiva para tests
process.env.RATE_LIMIT_WINDOW = '60000'; // 1 minuto
process.env.RATE_LIMIT_MAX_REQUESTS = '1000'; // 1000 requests

// Variables globales para tests de integración
global.integrationTestUtils = {
  // Servidor de test
  app: null,
  server: null,
  
  // Datos de test
  testUsers: new Map(),
  testTenants: new Map(),
  testChatbots: new Map(),
  testTokens: new Map(),
  
  // Inicializar servidor de test
  async startTestServer() {
    if (this.server) {
      return this.app;
    }
    
    // Importar la aplicación
    const { default: createApp } = await import('../server.js');
    this.app = createApp();
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(process.env.PORT, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Test server running on port ${process.env.PORT}`);
          resolve(this.app);
        }
      });
    });
  },
  
  // Detener servidor de test
  async stopTestServer() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          this.app = null;
          resolve();
        });
      });
    }
  },
  
  // Crear usuario de test en la base de datos
  async createTestUser(userData = {}) {
    const defaultUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      companyName: 'Test Company',
      plan: 'free'
    };
    
    const user = { ...defaultUser, ...userData };
    
    // Registrar usuario via API
    const response = await request(this.app)
      .post('/api/auth/register')
      .send(user)
      .expect(201);
    
    const createdUser = response.body.user;
    const token = response.body.token;
    
    this.testUsers.set(createdUser.id, createdUser);
    this.testTokens.set(createdUser.id, token);
    
    return { user: createdUser, token };
  },
  
  // Login de usuario de test
  async loginTestUser(email, password = 'TestPassword123!') {
    const response = await request(this.app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    
    const user = response.body.user;
    const token = response.body.token;
    
    this.testTokens.set(user.id, token);
    
    return { user, token };
  },
  
  // Crear chatbot de test
  async createTestChatbot(userId, chatbotData = {}) {
    const token = this.testTokens.get(userId);
    if (!token) {
      throw new Error('Token not found for user');
    }
    
    const defaultChatbot = {
      name: `Test Chatbot ${Date.now()}`,
      description: 'Chatbot de prueba para integración',
      config: {
        aiEnabled: true,
        welcomeEnabled: true
      }
    };
    
    const chatbot = { ...defaultChatbot, ...chatbotData };
    
    const response = await request(this.app)
      .post('/api/chatbots')
      .set('Authorization', `Bearer ${token}`)
      .send(chatbot)
      .expect(201);
    
    const createdChatbot = response.body.chatbot;
    this.testChatbots.set(createdChatbot.id, createdChatbot);
    
    return createdChatbot;
  },
  
  // Limpiar datos de test
  async cleanupTestData() {
    // Limpiar chatbots
    for (const [chatbotId] of this.testChatbots) {
      try {
        // Aquí se podría implementar limpieza de BD si es necesario
        // Por ahora solo limpiamos el Map
      } catch (error) {
        console.warn(`Error cleaning chatbot ${chatbotId}:`, error.message);
      }
    }
    
    // Limpiar usuarios
    for (const [userId] of this.testUsers) {
      try {
        // Aquí se podría implementar limpieza de BD si es necesario
        // Por ahora solo limpiamos el Map
      } catch (error) {
        console.warn(`Error cleaning user ${userId}:`, error.message);
      }
    }
    
    // Limpiar Maps
    this.testUsers.clear();
    this.testTenants.clear();
    this.testChatbots.clear();
    this.testTokens.clear();
  },
  
  // Hacer request autenticado
  async authenticatedRequest(method, path, userId, data = null) {
    const token = this.testTokens.get(userId);
    if (!token) {
      throw new Error('Token not found for user');
    }
    
    let req = request(this.app)[method.toLowerCase()](path)
      .set('Authorization', `Bearer ${token}`);
    
    if (data) {
      req = req.send(data);
    }
    
    return req;
  },
  
  // Esperar por condición
  async waitFor(condition, timeout = 5000, interval = 100) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }
};

// Setup antes de todos los tests de integración
beforeAll(async () => {
  await global.integrationTestUtils.startTestServer();
}, 30000);

// Cleanup después de cada test de integración
afterEach(async () => {
  await global.integrationTestUtils.cleanupTestData();
});

// Cleanup después de todos los tests de integración
afterAll(async () => {
  await global.integrationTestUtils.stopTestServer();
}, 10000);

// Configuración de timeouts más largos para integración
jest.setTimeout(60000);