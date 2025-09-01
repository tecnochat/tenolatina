#!/usr/bin/env node

/**
 * TecnoBot SAAS - Setup Script
 * Configura el proyecto para desarrollo o producción
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Colores para la consola
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Función para imprimir con colores
function print(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Función para crear directorios
function createDirectories() {
    const directories = [
        'logs',
        'uploads',
        'sessions',
        'temp',
        'backups',
        'tests/unit',
        'tests/integration',
        'scripts',
        'monitoring',
        'nginx',
        'elk/logstash/config',
        'elk/logstash/pipeline'
    ];

    print('📁 Creando directorios necesarios...', 'cyan');
    
    directories.forEach(dir => {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            print(`   ✓ ${dir}`, 'green');
        } else {
            print(`   - ${dir} (ya existe)`, 'yellow');
        }
    });
}

// Función para crear archivos de configuración
function createConfigFiles() {
    print('⚙️  Creando archivos de configuración...', 'cyan');
    
    // .gitignore
    const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.production
.env.test

# Logs
logs/
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# Stores VSCode versions used for testing VSCode extensions
.vscode-test

# Application specific
uploads/
sessions/
temp/
backups/
*.sqlite
*.db

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# Docker
.dockerignore

# Testing
.jest/

# Build
dist/
build/
`;
    
    writeFileIfNotExists('.gitignore', gitignoreContent);
    
    // ecosystem.config.js para PM2
    const pm2Config = `module.exports = {
  apps: [{
    name: 'tecnobot-api',
    script: 'app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads', 'sessions'],
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
`;
    
    writeFileIfNotExists('ecosystem.config.js', pm2Config);
    
    // jest.config.js
    const jestConfig = `module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/config/**',
    '!src/migrations/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true
};
`;
    
    writeFileIfNotExists('jest.config.js', jestConfig);
    
    // .eslintrc.js
    const eslintConfig = `module.exports = {
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
`;
    
    writeFileIfNotExists('.eslintrc.js', eslintConfig);
    
    // tests/setup.js
    const testSetup = `// Jest setup file
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
`;
    
    writeFileIfNotExists('tests/setup.js', testSetup);
}

// Función para escribir archivo si no existe
function writeFileIfNotExists(filePath, content) {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, content);
        print(`   ✓ ${filePath}`, 'green');
    } else {
        print(`   - ${filePath} (ya existe)`, 'yellow');
    }
}

// Función para verificar dependencias
function checkDependencies() {
    print('🔍 Verificando dependencias...', 'cyan');
    
    try {
        // Verificar Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion < 16) {
            print(`   ❌ Node.js ${nodeVersion} detectado. Se requiere >= 16.0.0`, 'red');
            process.exit(1);
        } else {
            print(`   ✓ Node.js ${nodeVersion}`, 'green');
        }
        
        // Verificar npm
        const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
        print(`   ✓ npm ${npmVersion}`, 'green');
        
    } catch (error) {
        print(`   ❌ Error verificando dependencias: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Función para instalar dependencias
function installDependencies() {
    print('📦 Instalando dependencias...', 'cyan');
    
    try {
        execSync('npm install', { stdio: 'inherit' });
        print('   ✓ Dependencias instaladas correctamente', 'green');
    } catch (error) {
        print(`   ❌ Error instalando dependencias: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Función para configurar variables de entorno
function setupEnvironment() {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
        print('⚙️  Configurando variables de entorno...', 'cyan');
        
        const envExamplePath = path.join(process.cwd(), '.env.example');
        if (fs.existsSync(envExamplePath)) {
            fs.copyFileSync(envExamplePath, envPath);
            print('   ✓ Archivo .env creado desde .env.example', 'green');
            print('   ⚠️  Recuerda configurar las variables en .env', 'yellow');
        } else {
            print('   ❌ No se encontró .env.example', 'red');
        }
    } else {
        print('   - .env ya existe', 'yellow');
    }
}

// Función para mostrar información post-instalación
function showPostInstallInfo() {
    print('\n🎉 ¡Configuración completada!', 'green');
    print('\n📋 Próximos pasos:', 'cyan');
    print('\n1. Configurar variables de entorno:', 'bright');
    print('   - Editar el archivo .env con tus configuraciones', 'reset');
    print('   - Configurar Supabase URL y keys', 'reset');
    print('   - Agregar OpenAI API key (opcional)', 'reset');
    
    print('\n2. Configurar base de datos:', 'bright');
    print('   - Ejecutar migraciones: npm run db:migrate', 'reset');
    print('   - Poblar datos iniciales: npm run db:seed', 'reset');
    
    print('\n3. Iniciar desarrollo:', 'bright');
    print('   - Modo desarrollo: npm run dev', 'reset');
    print('   - Ejecutar tests: npm test', 'reset');
    print('   - Ver logs: npm run logs', 'reset');
    
    print('\n4. URLs importantes:', 'bright');
    print('   - API: http://localhost:3000/api', 'reset');
    print('   - Docs: http://localhost:3000/api/docs', 'reset');
    print('   - Health: http://localhost:3000/health', 'reset');
    
    print('\n📚 Documentación:', 'cyan');
    print('   - README.md - Documentación completa', 'reset');
    print('   - /api/docs - Documentación de API', 'reset');
    
    print('\n🆘 Soporte:', 'cyan');
    print('   - GitHub: https://github.com/tecnobot/tecnobot-saas', 'reset');
    print('   - Email: support@tecnobot.app', 'reset');
    
    print('\n✨ ¡Feliz desarrollo!', 'magenta');
}

// Función principal
async function main() {
    print('🚀 TecnoBot SAAS - Script de Configuración', 'bright');
    print('==========================================\n', 'bright');
    
    try {
        // Verificar dependencias del sistema
        checkDependencies();
        
        // Crear directorios necesarios
        createDirectories();
        
        // Crear archivos de configuración
        createConfigFiles();
        
        // Configurar variables de entorno
        setupEnvironment();
        
        // Preguntar si instalar dependencias
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const answer = await new Promise(resolve => {
            rl.question('¿Instalar dependencias de npm? (y/N): ', resolve);
        });
        
        rl.close();
        
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            installDependencies();
        } else {
            print('   - Instalación de dependencias omitida', 'yellow');
            print('   - Ejecuta "npm install" manualmente cuando estés listo', 'yellow');
        }
        
        // Mostrar información post-instalación
        showPostInstallInfo();
        
    } catch (error) {
        print(`\n❌ Error durante la configuración: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = {
    createDirectories,
    createConfigFiles,
    checkDependencies,
    setupEnvironment
};