import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn, execSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { platform } from 'os';

const execAsync = promisify(exec);

// Type definitions
interface ServiceConfig {
  name: string;
  script?: string;
  port: number;
  cwd: string;
  command: string;
  args: string[];
  isPm2Command: boolean;
}

interface ProcessInfo {
  pid: number;
  startTime: number;
  kill: (signal?: string | number) => void;
  stdout?: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface PM2Process {
  pid: number;
  name: string;
  pm2_env?: {
    namespace?: string;
    version?: string;
    exec_mode?: string;
    pm_uptime?: number;
    restart_time?: number;
    status?: string;
    USER?: string;
    watch?: boolean;
  };
  monit?: {
    cpu?: number;
    memory?: number;
  };
}

// Service configurations
const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  pm2: {
    name: 'PM2 Process Manager',
    script: 'pm2.py',
    port: 8087,
    cwd: path.join(process.cwd(), '..', 'backend'),
    command: 'python',
    args: ['pm2.py', '--port', '8087'],
    isPm2Command: true
  },
  python: {
    name: 'Python Services',
    script: 'main.py',
    port: 8088,
    cwd: path.join(process.cwd(), '..', 'backend'),
    command: 'python',
    args: ['main.py', '--port', '8088'],
    isPm2Command: false
  },
  pythonService: {
    name: 'Python Document Service',
    script: 'main.py',
    port: 8089,
    cwd: path.join(process.cwd(), '..', 'backend', 'python-services'),
    command: 'python',
    args: ['main.py', '--port', '8089'],
    isPm2Command: false
  }
};

// Store running processes
const runningProcesses: Map<string, ProcessInfo> = new Map();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; action: string }> }
) {
  const { service, action } = await params;
  
  if (!SERVICE_CONFIGS[service]) {
    return NextResponse.json(
      { error: 'Unknown service' },
      { status: 404 }
    );
  }

  const config = SERVICE_CONFIGS[service];

  try {
    switch (action) {
      case 'status':
        if (service === 'pm2' && config.isPm2Command) {
          // Use PM2 command for status
          try {
            const result = execSync('pm2 jlist', { encoding: 'utf8' });
            const processes = JSON.parse(result);
            
            // Return proper JSON string response
            const jsonResponse = JSON.stringify({
              success: true,
              processes: processes.map((proc: unknown) => {
                const p = proc as any;
                return {
                id: proc.pid,
                name: proc.name,
                namespace: proc.pm2_env?.namespace || 'default',
                version: proc.pm2_env?.version || 'N/A',
                mode: proc.pm2_env?.exec_mode || 'fork',
                pid: proc.pid,
                uptime: proc.pm2_env?.pm_uptime || 0,
                restarts: proc.pm2_env?.restart_time || 0,
                status: proc.pm2_env?.status || 'unknown',
                cpu: proc.monit?.cpu || 0,
                memory: proc.monit?.memory || 0,
                user: proc.pm2_env?.USER || 'unknown',
                watching: p.pm2_env?.watch || false
              };
              })
            });
            
            return new NextResponse(jsonResponse, {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            });
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[PM2] Error getting status:', error);
            return NextResponse.json(
              { success: false, error: errorMessage },
              { status: 500 }
            );
          }
        } else {
          // Use our process tracking for other services
          const process = runningProcesses.get(service);
          if (!process) {
            return NextResponse.json({
              success: true,
              processes: [],
              service: service,
              status: 'not_running'
            });
          }

          return NextResponse.json({
            success: true,
            processes: [{
              id: process.pid,
              name: config.name,
              namespace: 'default',
              version: '1.0.0',
              mode: 'fork',
              pid: process.pid,
              uptime: Date.now() - process.startTime,
              restarts: 0,
              status: 'online',
              cpu: 0,
              memory: 0,
              user: 'system',
              watching: false
            }],
            service: service,
            status: 'running'
          });
        }

      case 'list':
        if (service === 'pm2' && config.isPm2Command) {
          try {
            const result = execSync('pm2 list', { encoding: 'utf8' });
            const lines = result.split('\n').filter((line: string) => line.trim());
            
            // Parse PM2 list output
            const processes = [];
            
            for (const line of lines) {
              if (line.includes('│')) {
                const columns = line.split('│').map((col: string) => col.trim());
                if (columns.length >= 10) {
                  processes.push({
                    id: columns[0] || 'N/A',
                    name: columns[1] || 'N/A',
                    namespace: columns[2] || 'default',
                    version: columns[3] || 'N/A',
                    mode: columns[4] || 'fork',
                    pid: columns[5] || 'N/A',
                    uptime: columns[6] || '0',
                    status: columns[7] || 'unknown',
                    cpu: columns[8] || '0',
                    memory: columns[9] || '0',
                    user: 'umu...',
                    watching: columns[10] || 'disabled'
                  });
                }
              }
            }
            
            return NextResponse.json({
              success: true,
              processes
            });
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[PM2] Error listing processes:', error);
            return NextResponse.json(
              { success: false, error: errorMessage },
              { status: 500 }
            );
          }
        } else {
          // Return our tracked processes
          const processes = Array.from(runningProcesses.entries()).map(([id, proc]) => ({
            id: proc.pid,
            name: config.name,
            namespace: 'default',
            version: '1.0.0',
            mode: 'fork',
            pid: proc.pid,
            uptime: Date.now() - proc.startTime,
            status: 'online',
            cpu: 0,
            memory: 0,
            user: 'system',
            watching: false
          }));

          return NextResponse.json({
            success: true,
            processes
          });
        }

      default:
        return NextResponse.json(
          { success: false, error: `Action '${action}' is not supported` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[Services API] Error ${action} ${service}:`, error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; action: string }> }
) {
  const { service, action } = await params;
  const body = await request.json();
  
  if (!SERVICE_CONFIGS[service]) {
    return NextResponse.json(
      { error: 'Unknown service' },
      { status: 404 }
    );
  }

  const config = SERVICE_CONFIGS[service];

  try {
    switch (action) {
      case 'start':
        return await startService(service, config);
        
      case 'stop':
        return await stopService(service, config);
        
      case 'restart':
        if (service === 'pm2' && config.isPm2Command) {
          const { processName } = body;
          
          if (!processName) {
            return NextResponse.json(
              { success: false, error: 'Process name is required' },
              { status: 400 }
            );
          }

          try {
            const result = execSync(`pm2 restart ${processName}`, { encoding: 'utf8' });
            return NextResponse.json({
              success: true,
              message: `Process '${processName}' restarted successfully`,
              output: result
            });
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[PM2] Error restarting process:', error);
            return NextResponse.json(
              { success: false, error: errorMessage },
              { status: 500 }
            );
          }
        } else {
          // Stop and start for other services
          await stopService(service, config);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return await startService(service, config);
        }

      default:
        return NextResponse.json(
          { success: false, error: `Action '${action}' is not supported` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[Services API] Error ${action} ${service}:`, error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

async function startService(serviceId: string, config: ServiceConfig) {
  // Check if already running
  if (runningProcesses.has(serviceId)) {
    return NextResponse.json({ 
      status: 'already_running',
      message: `${config.name} is already running`
    });
  }

  try {
    // Check if script exists (for Python services)
    if (config.script) {
      const scriptPath = path.join(config.cwd, config.script);
      try {
        await fs.access(scriptPath);
      } catch {
        return NextResponse.json(
          { error: `Script not found: ${scriptPath}` },
          { status: 404 }
        );
      }
    }

    // Start process
    const childProcess = spawn(config.command, config.args, {
      cwd: config.cwd,
      detached: false,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });

    // Create ProcessInfo object
    const processInfo: ProcessInfo = {
      pid: childProcess.pid || 0,
      startTime: Date.now(),
      kill: (signal?: string | number) => {
        if (typeof signal === 'string') {
          childProcess.kill(signal as NodeJS.Signals);
        } else {
          childProcess.kill(signal);
        }
      },
      stdout: childProcess.stdout,
      stderr: childProcess.stderr,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        childProcess.on(event, listener);
      }
    };

    // Store process reference
    runningProcesses.set(serviceId, processInfo);

    // Handle process output
    processInfo.stdout?.on('data', (data: Buffer) => {
      console.log(`[${serviceId}] ${data.toString()}`);
    });

    processInfo.stderr?.on('data', (data: Buffer) => {
      console.error(`[${serviceId}] ${data.toString()}`);
    });

    processInfo.on('exit', (...args: unknown[]) => {
      const code = args[0] as number | null;
      console.log(`[${serviceId}] Process exited with code ${code}`);
      runningProcesses.delete(serviceId);
    });

    return NextResponse.json({ 
      status: 'started',
      message: `${config.name} started successfully`,
      pid: processInfo.pid
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to start service';
    console.error('Failed to start service:', error);
    return NextResponse.json(
      { error: 'Failed to start service' },
      { status: 500 }
    );
  }
}

async function stopService(serviceId: string, config: ServiceConfig) {
  const process = runningProcesses.get(serviceId);
  
  if (!process) {
    // Try to find and kill by port if no stored process
    if (config.port) {
      try {
        if (platform() === 'win32') {
          // Windows: Find and kill process by port
          const { stdout } = await execAsync(`netstat -ano | findstr :${config.port}`);
          const lines = stdout.trim().split('\n');
          
          for (const line of lines) {
            if (line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              await execAsync(`taskkill /F /PID ${pid}`);
              return NextResponse.json({ 
                status: 'stopped',
                message: `${config.name} stopped`
              });
            }
          }
        } else {
          // Unix-like: Use lsof to find and kill
          const { stdout } = await execAsync(`lsof -ti:${config.port}`);
          const pid = stdout.trim();
          if (pid) {
            await execAsync(`kill -9 ${pid}`);
            return NextResponse.json({ 
              status: 'stopped',
              message: `${config.name} stopped`
            });
          }
        }
      } catch (error) {
        // Process might not be running
      }
    }
    
    return NextResponse.json({ 
      status: 'not_running',
      message: `${config.name} is not running`
    });
  }

  // Kill stored process
  try {
    if (platform() === 'win32') {
      await execAsync(`taskkill /F /PID ${process.pid}`);
    } else {
      process.kill('SIGTERM');
    }
    
    runningProcesses.delete(serviceId);
    
    return NextResponse.json({ 
      status: 'stopped',
      message: `${config.name} stopped successfully`
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to stop service';
    console.error('Failed to stop service:', error);
    return NextResponse.json(
      { error: 'Failed to stop service' },
      { status: 500 }
    );
  }
}