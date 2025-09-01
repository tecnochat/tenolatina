/**
 * Test script para validar todos los endpoints de la API multi-tenant
 * TecnoBot SAAS - Fase 3: API y Backend
 */

const axios = require('axios');
const colors = require('colors');

// Configuración base
const BASE_URL = 'http://localhost:3020/api';
let authToken = null;
let testTenantId = null;
let testChatbotId = null;

// Configuración de axios
axios.defaults.timeout = 10000;

// Utilidades
const log = {
  success: (msg) => console.log(`✅ ${msg}`.green),
  error: (msg) => console.log(`❌ ${msg}`.red),
  info: (msg) => console.log(`ℹ️  ${msg}`.blue),
  warning: (msg) => console.log(`⚠️  ${msg}`.yellow),
  section: (msg) => console.log(`\n🔧 ${msg}`.cyan.bold)
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función para hacer requests con manejo de errores
async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
}

// Función para hacer requests autenticados
async function authenticatedRequest(method, endpoint, data = null) {
  const headers = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
  return makeRequest(method, endpoint, data, headers);
}

// Tests de autenticación
async function testAuthentication() {
  log.section('TESTING AUTHENTICATION ENDPOINTS');

  // Test 1: Login con credenciales válidas
  log.info('Testing login with valid credentials...');
  const loginResult = await makeRequest('POST', '/auth/login', {
    email: 'admin@tecnobot.com',
    password: 'admin123'
  });

  if (loginResult.success && loginResult.data.success) {
    authToken = loginResult.data.data.tokens.access_token;
    testTenantId = loginResult.data.data.tenant.id;
    log.success('Login successful - Token obtained');
    log.info(`Tenant ID: ${testTenantId}`);
  } else {
    log.error('Login failed - Creating test user...');
    
    // Intentar crear usuario de prueba
    const signupResult = await makeRequest('POST', '/auth/signup', {
      email: 'admin@tecnobot.com',
      password: 'admin123',
      full_name: 'Admin Test',
      tenant_name: 'TecnoBot Test',
      tenant_domain: 'tecnobot-test'
    });

    if (signupResult.success) {
      log.success('Test user created successfully');
      authToken = signupResult.data.data.tokens.access_token;
      testTenantId = signupResult.data.data.tenant.id;
    } else {
      log.error('Failed to create test user');
      log.error(JSON.stringify(signupResult.error, null, 2));
      return false;
    }
  }

  // Test 2: Verificar token
  log.info('Testing token validation...');
  const profileResult = await authenticatedRequest('GET', '/auth/profile');
  if (profileResult.success) {
    log.success('Token validation successful');
  } else {
    log.error('Token validation failed');
    return false;
  }

  return true;
}

// Tests de chatbots
async function testChatbotEndpoints() {
  log.section('TESTING CHATBOT ENDPOINTS');

  // Test 1: Listar chatbots
  log.info('Testing GET /chatbots...');
  const listResult = await authenticatedRequest('GET', '/chatbots');
  if (listResult.success) {
    log.success(`Found ${listResult.data.data.length} chatbots`);
  } else {
    log.error('Failed to list chatbots');
    log.error(JSON.stringify(listResult.error, null, 2));
  }

  // Test 2: Crear chatbot
  log.info('Testing POST /chatbots...');
  const createResult = await authenticatedRequest('POST', '/chatbots', {
    name: 'Test Chatbot API',
    description: 'Chatbot creado para testing de API',
    welcome_message: '¡Hola! Soy un chatbot de prueba.'
  });

  if (createResult.success && createResult.data.success) {
    testChatbotId = createResult.data.data.id;
    log.success(`Chatbot created with ID: ${testChatbotId}`);
  } else {
    log.error('Failed to create chatbot');
    log.error(JSON.stringify(createResult.error, null, 2));
    return false;
  }

  // Test 3: Obtener chatbot específico
  log.info('Testing GET /chatbots/:id...');
  const getResult = await authenticatedRequest('GET', `/chatbots/${testChatbotId}`);
  if (getResult.success) {
    log.success('Chatbot details retrieved successfully');
  } else {
    log.error('Failed to get chatbot details');
  }

  // Test 4: Actualizar chatbot
  log.info('Testing PUT /chatbots/:id...');
  const updateResult = await authenticatedRequest('PUT', `/chatbots/${testChatbotId}`, {
    name: 'Test Chatbot API - Updated',
    description: 'Chatbot actualizado via API testing'
  });

  if (updateResult.success) {
    log.success('Chatbot updated successfully');
  } else {
    log.error('Failed to update chatbot');
  }

  // Test 5: Activar chatbot
  log.info('Testing POST /chatbots/:id/activate...');
  const activateResult = await authenticatedRequest('POST', `/chatbots/${testChatbotId}/activate`);
  if (activateResult.success) {
    log.success('Chatbot activated successfully');
  } else {
    log.error('Failed to activate chatbot');
  }

  await sleep(1000);

  // Test 6: Desactivar chatbot
  log.info('Testing POST /chatbots/:id/deactivate...');
  const deactivateResult = await authenticatedRequest('POST', `/chatbots/${testChatbotId}/deactivate`);
  if (deactivateResult.success) {
    log.success('Chatbot deactivated successfully');
  } else {
    log.error('Failed to deactivate chatbot');
  }

  return true;
}

// Tests de configuración de chatbots
async function testChatbotConfigEndpoints() {
  log.section('TESTING CHATBOT CONFIG ENDPOINTS');

  if (!testChatbotId) {
    log.error('No test chatbot available for config testing');
    return false;
  }

  // Test 1: Obtener configuración
  log.info('Testing GET /chatbots/:id/config...');
  const getConfigResult = await authenticatedRequest('GET', `/chatbots/${testChatbotId}/config`);
  if (getConfigResult.success) {
    log.success('Chatbot config retrieved successfully');
  } else {
    log.error('Failed to get chatbot config');
  }

  // Test 2: Actualizar configuración
  log.info('Testing PUT /chatbots/:id/config...');
  const updateConfigResult = await authenticatedRequest('PUT', `/chatbots/${testChatbotId}/config`, {
    ai_provider: 'openai',
    ai_model: 'gpt-3.5-turbo',
    ai_temperature: 0.8,
    ai_max_tokens: 200,
    ai_system_prompt: 'Eres un asistente de prueba para testing de API.',
    auto_response_enabled: true,
    auto_response_delay: 1500,
    webhook_url: 'https://webhook-test.com/endpoint'
  });

  if (updateConfigResult.success) {
    log.success('Chatbot config updated successfully');
  } else {
    log.error('Failed to update chatbot config');
  }

  // Test 3: Obtener estadísticas
  log.info('Testing GET /chatbots/:id/stats...');
  const statsResult = await authenticatedRequest('GET', `/chatbots/${testChatbotId}/stats?period=7d`);
  if (statsResult.success) {
    log.success('Chatbot stats retrieved successfully');
  } else {
    log.error('Failed to get chatbot stats');
  }

  // Test 4: Probar webhook
  log.info('Testing POST /chatbots/:id/test-webhook...');
  const webhookTestResult = await authenticatedRequest('POST', `/chatbots/${testChatbotId}/test-webhook`);
  if (webhookTestResult.success) {
    log.success('Webhook test completed successfully');
  } else {
    log.warning('Webhook test failed (expected if webhook URL is not valid)');
  }

  return true;
}

// Tests de gestión de tenants (solo para platform admin)
async function testTenantEndpoints() {
  log.section('TESTING TENANT MANAGEMENT ENDPOINTS');

  // Test 1: Listar tenants (requiere PLATFORM_ADMIN)
  log.info('Testing GET /tenants...');
  const listTenantsResult = await authenticatedRequest('GET', '/tenants');
  if (listTenantsResult.success) {
    log.success('Tenants list retrieved successfully');
  } else if (listTenantsResult.status === 403) {
    log.warning('Access denied to tenants endpoint (expected for non-platform-admin users)');
  } else {
    log.error('Failed to access tenants endpoint');
  }

  // Test 2: Obtener tenant específico
  log.info('Testing GET /tenants/:id...');
  const getTenantResult = await authenticatedRequest('GET', `/tenants/${testTenantId}`);
  if (getTenantResult.success) {
    log.success('Tenant details retrieved successfully');
  } else if (getTenantResult.status === 403) {
    log.warning('Access denied to tenant details (expected for non-platform-admin users)');
  } else {
    log.error('Failed to get tenant details');
  }

  return true;
}

// Tests de middleware y seguridad
async function testSecurityMiddleware() {
  log.section('TESTING SECURITY MIDDLEWARE');

  // Test 1: Acceso sin token
  log.info('Testing access without token...');
  const noTokenResult = await makeRequest('GET', '/chatbots');
  if (noTokenResult.status === 401) {
    log.success('Unauthorized access properly blocked');
  } else {
    log.error('Security vulnerability: Access allowed without token');
  }

  // Test 2: Token inválido
  log.info('Testing access with invalid token...');
  const invalidTokenResult = await makeRequest('GET', '/chatbots', null, {
    'Authorization': 'Bearer invalid_token_here'
  });
  if (invalidTokenResult.status === 401) {
    log.success('Invalid token properly rejected');
  } else {
    log.error('Security vulnerability: Invalid token accepted');
  }

  // Test 3: Rate limiting (hacer múltiples requests rápidos)
  log.info('Testing rate limiting...');
  const rateLimitPromises = [];
  for (let i = 0; i < 10; i++) {
    rateLimitPromises.push(authenticatedRequest('GET', '/chatbots'));
  }

  const rateLimitResults = await Promise.all(rateLimitPromises);
  const rateLimitedRequests = rateLimitResults.filter(r => r.status === 429);
  
  if (rateLimitedRequests.length > 0) {
    log.success('Rate limiting is working');
  } else {
    log.warning('Rate limiting may not be configured or limits are high');
  }

  return true;
}

// Cleanup: eliminar recursos de prueba
async function cleanup() {
  log.section('CLEANING UP TEST RESOURCES');

  if (testChatbotId) {
    log.info('Deleting test chatbot...');
    const deleteResult = await authenticatedRequest('DELETE', `/chatbots/${testChatbotId}`);
    if (deleteResult.success) {
      log.success('Test chatbot deleted successfully');
    } else {
      log.warning('Failed to delete test chatbot (may need manual cleanup)');
    }
  }

  // Logout
  log.info('Logging out...');
  const logoutResult = await authenticatedRequest('POST', '/auth/logout');
  if (logoutResult.success) {
    log.success('Logout successful');
  } else {
    log.warning('Logout failed or endpoint not implemented');
  }
}

// Función principal de testing
async function runAllTests() {
  console.log('🚀 TecnoBot SAAS API Testing Suite'.rainbow.bold);
  console.log('=====================================\n');

  let allTestsPassed = true;

  try {
    // Test de autenticación
    const authSuccess = await testAuthentication();
    if (!authSuccess) {
      log.error('Authentication tests failed - aborting');
      return;
    }

    await sleep(1000);

    // Test de endpoints de chatbots
    const chatbotSuccess = await testChatbotEndpoints();
    if (!chatbotSuccess) {
      allTestsPassed = false;
    }

    await sleep(1000);

    // Test de configuración de chatbots
    const configSuccess = await testChatbotConfigEndpoints();
    if (!configSuccess) {
      allTestsPassed = false;
    }

    await sleep(1000);

    // Test de gestión de tenants
    const tenantSuccess = await testTenantEndpoints();
    if (!tenantSuccess) {
      allTestsPassed = false;
    }

    await sleep(1000);

    // Test de seguridad
    const securitySuccess = await testSecurityMiddleware();
    if (!securitySuccess) {
      allTestsPassed = false;
    }

    await sleep(1000);

    // Cleanup
    await cleanup();

  } catch (error) {
    log.error(`Unexpected error during testing: ${error.message}`);
    allTestsPassed = false;
  }

  // Resumen final
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    log.success('🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    log.info('API is ready for production use.');
  } else {
    log.error('❌ SOME TESTS FAILED');
    log.info('Please review the errors above and fix the issues.');
  }
  console.log('='.repeat(50));
}

// Verificar si el servidor está corriendo
async function checkServerStatus() {
  try {
    const response = await axios.get(`${BASE_URL.replace('/api', '')}/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Ejecutar tests
async function main() {
  log.info('Checking server status...');
  const serverRunning = await checkServerStatus();
  
  if (!serverRunning) {
    log.error('Server is not running or not accessible');
    log.info('Please start the server with: npm start');
    process.exit(1);
  }

  log.success('Server is running - starting tests...');
  await sleep(1000);
  
  await runAllTests();
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(error => {
    log.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testAuthentication,
  testChatbotEndpoints,
  testChatbotConfigEndpoints,
  testTenantEndpoints,
  testSecurityMiddleware
};