
import { IExecuteFunctions } from 'n8n-workflow';
import {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import express, { Express, Request, Response } from 'express';
import { Server as HttpServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import path from 'path';
import fs from 'fs';

// Simple in-memory flag to track if the server is running
// This is a basic approach for a single n8n instance.
// In a multi-worker setup, a more robust solution (like a Redis flag) would be needed.
let isServerRunning = false;
let httpServer: HttpServer | null = null;

export class Dashboard implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ASB Dashboard',
		name: 'asbDashboard',
		icon: 'file:alice-bridge.svg',
		group: ['transform'],
		version: 1,
		description: 'Starts the Alice Semantic Bridge Control Center Dashboard',
		defaults: {
			name: 'ASB Dashboard',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Port',
				name: 'port',
				type: 'number',
				default: 3000,
				description: 'The port on which the dashboard server will run',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const port = this.getNodeParameter('port', 0) as number;
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		if (isServerRunning) {
			console.log(`Dashboard server is already running on port ${port}`);
			returnData.push({ json: { message: `Dashboard server already running at http://localhost:${port}` }});
			return [returnData];
		}

		const app: Express = express();
		const server = new HttpServer(app);
		const io = new SocketIoServer(server, {
			cors: {
				origin: '*', // Allow all origins for simplicity
			},
		});

		// Serve static files from the dashboard directory
		const dashboardPath = path.join(__dirname, '..', '..', 'dashboard');
        
        // Check if dashboard directory exists
        if (!fs.existsSync(dashboardPath)) {
            throw new Error(`Dashboard directory not found at ${dashboardPath}. Please ensure the 'dashboard' folder exists at the project root.`);
        }

		app.use(express.static(dashboardPath));

		// API Endpoints
		app.get('/api/v1/health', (req: Request, res: Response) => {
			res.json({ status: 'ok' });
		});

        // Mock other endpoints for now
        app.get('/api/v1/redis/ping', (req, res) => res.json({ status: 'ok' }));
        app.get('/api/v1/agents/status', (req, res) => res.json({ claude: {}, gemini: {}, codex: {} }));
        app.get('/api/v1/metrics/performance', (req, res) => res.json({}));
        app.get('/api/v1/workflows', (req, res) => res.json([]));
        app.get('/api/v1/redis/stats', (req, res) => res.json({}));
        app.post('/api/v1/deploy', (req, res) => res.json({ message: 'Deployment simulated' }));
        app.post('/api/v1/tests/run', (req, res) => res.json({ passed: 0, total: 0, failed: 0 }));
        app.post('/api/v1/cache/clear', (req, res) => res.json({ message: 'Cache cleared' }));


		// WebSocket connection
		io.on('connection', (socket) => {
			console.log('A user connected to the dashboard');
			socket.emit('log-event', { type: 'success', message: 'Successfully connected to ASB backend.' });

			socket.on('disconnect', () => {
				console.log('User disconnected');
			});
		});

		server.listen(port, () => {
			console.log(`Dashboard server started at http://localhost:${port}`);
			isServerRunning = true;
			httpServer = server;
		});
        
        // This part is tricky for a long-running server in n8n.
        // We'll return immediately, and the server will run in the background.
        // The user needs to manually stop the workflow to stop the server.
        // A 'close' function could be implemented if this were a trigger node.

		returnData.push({ json: { message: `Dashboard server started at http://localhost:${port}` }});
		return this.prepareOutputData(returnData);
	}
}
