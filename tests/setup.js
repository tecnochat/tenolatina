// Jest setup file
// Global test configuration

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock external services
jest.mock('../src/services/whatsapp', () => ({
  whatsappService: {
    sendMessage: jest.fn(),
    getConnectionStatus: jest.fn(),
    getAllConnectionsStatus: jest.fn(() => ({ active: 0, total: 0 }))
  }
}));

jest.mock('../src/services/ai', () => ({
  aiService: {
    generateResponse: jest.fn(),
    getProvidersStatus: jest.fn(() => ({ openai: 'connected', anthropic: 'connected' }))
  }
}));

jest.mock('../src/services/notifications', () => ({
  notificationService: {
    sendNotification: jest.fn(),
    getProvidersStatus: jest.fn(() => ({ email: 'connected', sms: 'connected' }))
  }
}));

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
