#!/usr/bin/env node

/**
 * Script de desarrollo para TecnoBot SAAS
 * 
 * Este script inicia el servidor de desarrollo con:
 * - Recarga automática de archivos
 * - Variables de entorno de desarrollo
 * - Logging mejorado
 * - Verificaciones de salud
 * 
 * Uso: node scripts/dev.js
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
require('dotenv').config();

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

const log = {
    info: (msg) => console.log(`${colors.blue}[DEV]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[DEV]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[DEV]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[DEV]${colors.reset} ${msg}`),
    server: (msg) => console.log(`${colors.cyan}[SERVER]${colors.reset} ${msg}`),
    watcher: (msg) => console.log(`${colors.magenta}[WATCH]${colors.reset} ${msg}`)
};

class DevServer {
    constructor() {
        this.serverProcess = null;
        this.isRestarting = false;
        this.restartTimeout = null;
        this.startTime = Date.now();
        
        // Configuración de desarrollo
        this.config = {
            port: process.env.PORT || 3020,
            host: process.env.HOST || 'localhost',
            watchPaths: [
                'src/**/*.js',
                'routes/**/*.js',
                'middleware/**/*.js',
                'services/**/*.js',
                'utils/**/*.js',
                'config/**/*.js'
            ],
            ignorePaths: [
                'node_modules/**',
                'logs/**',
                'uploads/**',
                'sessions/**',
                'temp/**',
                'backups/**',
                '**/*.log'
            ],
            restartDelay: 1000
        };

        // Manejar señales de terminación
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', (error) => {
            log.error(`Excepción no capturada: ${error.message}`);
            this.shutdown();
        });
    }

    async start() {
        try {
            this.showBanner();
            await this.checkEnvironment();
            await this.setupWatcher();
            await this.startServer();
            this.showStartupInfo();
        } catch (error) {
            log.error(`Error iniciando servidor de desarrollo: ${error.message}`);
            process.exit(1);
        }
    }

    showBanner() {
        console.clear();
        console.log(colors.cyan + colors.bright);
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║                    TECNOBOT SAAS                         ║');
        console.log('║                 Servidor de Desarrollo                   ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log(colors.reset);
        console.log(`🚀 Iniciando en modo desarrollo...\n`);
    }

    async checkEnvironment() {
        log.info('Verificando entorno de desarrollo...');

        // Verificar archivo .env
        const envPath = path.join(process.cwd(), '.env');
        if (!fs.existsSync(envPath)) {
            log.warning('Archivo .env no encontrado. Creando desde .env.example...');
            
            const examplePath = path.join(process.cwd(), '.env.example');
            if (fs.existsSync(examplePath)) {
                fs.copyFileSync(examplePath, envPath);
                log.success('Archivo .env creado desde .env.example');
                log.warning('¡Recuerda configurar las variables de entorno!');
            } else {
                throw new Error('No se encontró .env.example para crear .env');
            }
        }

        // Verificar variables críticas
        const criticalVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
        const missingVars = criticalVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            log.warning(`Variables críticas no configuradas: ${missingVars.join(', ')}`);
            log.info('El servidor puede no funcionar correctamente sin estas variables.');
        }

        // Verificar directorios necesarios
        const requiredDirs = ['logs', 'uploads', 'sessions', 'temp'];
        for (const dir of requiredDirs) {
            const dirPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                log.info(`Directorio ${dir} creado`);
            }
        }

        // Configurar variables de desarrollo
        process.env.NODE_ENV = 'development';
        process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
        process.env.ENABLE_CORS = 'true';
        process.env.ENABLE_MORGAN = 'true';

        log.success('Entorno de desarrollo configurado');
    }

    async setupWatcher() {
        log.info('Configurando observador de archivos...');

        this.watcher = chokidar.watch(this.config.watchPaths, {
            ignored: this.config.ignorePaths,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100
            }
        });

        this.watcher.on('change', (filePath) => {
            log.watcher(`Archivo modificado: ${path.relative(process.cwd(), filePath)}`);
            this.scheduleRestart();
        });

        this.watcher.on('add', (filePath) => {
            log.watcher(`Archivo agregado: ${path.relative(process.cwd(), filePath)}`);
            this.scheduleRestart();
        });

        this.watcher.on('unlink', (filePath) => {
            log.watcher(`Archivo eliminado: ${path.relative(process.cwd(), filePath)}`);
            this.scheduleRestart();
        });

        this.watcher.on('error', (error) => {
            log.error(`Error en observador: ${error.message}`);
        });

        log.success('Observador de archivos configurado');
    }

    async startServer() {
        return new Promise((resolve, reject) => {
            log.info('Iniciando servidor...');

            // Argumentos para el servidor
            const args = [
                'src/app.js',
                '--inspect=9229'
            ];

            // Opciones del proceso
            const options = {
                stdio: ['inherit', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    FORCE_COLOR: '1',
                    NODE_ENV: 'development'
                },
                cwd: process.cwd()
            };

            this.serverProcess = spawn('node', args, options);

            // Manejar salida del servidor
            this.serverProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    // Formatear logs del servidor
                    output.split('\n').forEach(line => {
                        if (line.includes('ERROR') || line.includes('error')) {
                            log.error(line);
                        } else if (line.includes('WARN') || line.includes('warning')) {
                            log.warning(line);
                        } else if (line.includes('listening') || line.includes('started')) {
                            log.success(line);
                        } else {
                            log.server(line);
                        }
                    });
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                const output = data.toString().trim();
                if (output && !output.includes('Debugger listening')) {
                    log.error(output);
                }
            });

            this.serverProcess.on('close', (code) => {
                if (code !== 0 && !this.isRestarting) {
                    log.error(`Servidor terminó con código ${code}`);
                    reject(new Error(`Servidor falló con código ${code}`));
                } else if (!this.isRestarting) {
                    log.info('Servidor detenido');
                }
            });

            this.serverProcess.on('error', (error) => {
                log.error(`Error del servidor: ${error.message}`);
                reject(error);
            });

            // Esperar un momento para que el servidor inicie
            setTimeout(() => {
                if (this.serverProcess && !this.serverProcess.killed) {
                    resolve();
                }
            }, 2000);
        });
    }

    scheduleRestart() {
        if (this.isRestarting) return;

        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
        }

        this.restartTimeout = setTimeout(() => {
            this.restart();
        }, this.config.restartDelay);
    }

    async restart() {
        if (this.isRestarting) return;

        this.isRestarting = true;
        log.info('🔄 Reiniciando servidor...');

        try {
            // Detener servidor actual
            if (this.serverProcess && !this.serverProcess.killed) {
                this.serverProcess.kill('SIGTERM');
                
                // Esperar a que termine
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        if (!this.serverProcess.killed) {
                            this.serverProcess.kill('SIGKILL');
                        }
                        resolve();
                    }, 5000);

                    this.serverProcess.on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            }

            // Limpiar caché de módulos
            this.clearModuleCache();

            // Iniciar nuevo servidor
            await this.startServer();
            
            const uptime = Math.round((Date.now() - this.startTime) / 1000);
            log.success(`✅ Servidor reiniciado (uptime: ${uptime}s)`);
            
        } catch (error) {
            log.error(`Error reiniciando servidor: ${error.message}`);
        } finally {
            this.isRestarting = false;
        }
    }

    clearModuleCache() {
        // Limpiar caché de módulos para forzar recarga
        const cacheKeys = Object.keys(require.cache);
        const projectPath = process.cwd();
        
        cacheKeys.forEach(key => {
            if (key.startsWith(projectPath) && !key.includes('node_modules')) {
                delete require.cache[key];
            }
        });
    }

    showStartupInfo() {
        console.log('\n' + colors.green + colors.bright + '🎉 SERVIDOR DE DESARROLLO INICIADO' + colors.reset);
        console.log('━'.repeat(50));
        console.log(`🌐 Servidor: http://${this.config.host}:${this.config.port}`);
        console.log(`🔧 Debugger: chrome://inspect (puerto 9229)`);
        console.log(`📁 Directorio: ${process.cwd()}`);
        console.log(`⏰ Iniciado: ${new Date().toLocaleString()}`);
        console.log('━'.repeat(50));
        console.log(`${colors.cyan}💡 Comandos disponibles:${colors.reset}`);
        console.log('   • Ctrl+C: Detener servidor');
        console.log('   • rs + Enter: Reiniciar manualmente');
        console.log('   • Los archivos se recargan automáticamente');
        console.log('\n' + colors.yellow + '👀 Observando cambios en archivos...' + colors.reset + '\n');

        // Manejar entrada del usuario
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (data) => {
            const input = data.toString().trim().toLowerCase();
            if (input === 'rs') {
                log.info('Reinicio manual solicitado...');
                this.restart();
            }
        });
    }

    async shutdown() {
        log.info('🛑 Deteniendo servidor de desarrollo...');

        try {
            // Cerrar observador
            if (this.watcher) {
                await this.watcher.close();
                log.info('Observador de archivos cerrado');
            }

            // Detener servidor
            if (this.serverProcess && !this.serverProcess.killed) {
                this.serverProcess.kill('SIGTERM');
                
                // Esperar terminación graceful
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        if (!this.serverProcess.killed) {
                            this.serverProcess.kill('SIGKILL');
                        }
                        resolve();
                    }, 3000);

                    this.serverProcess.on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            }

            const uptime = Math.round((Date.now() - this.startTime) / 1000);
            log.success(`✅ Servidor detenido correctamente (uptime total: ${uptime}s)`);
            
        } catch (error) {
            log.error(`Error durante el cierre: ${error.message}`);
        } finally {
            process.exit(0);
        }
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    const devServer = new DevServer();
    devServer.start().catch(error => {
        console.error(`Error fatal: ${error.message}`);
        process.exit(1);
    });
}

module.exports = DevServer;