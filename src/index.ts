#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { google, drive_v3 } from 'googleapis'; // Import drive_v3 specifically
import * as fs from 'fs'; // Use standard fs for stream
import * as path from 'path';

// --- Configuration from Environment Variables ---
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Missing required Google OAuth environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
}

// --- Google API Setup ---
const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET
    // Redirect URI is not needed for server-to-server refresh token flow
);

oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN,
});

// Create a Drive API client instance
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// --- Tool Definitions ---

const UPLOAD_FILE_TOOL_NAME = 'upload_file';
const UPLOAD_FILE_SCHEMA = {
    type: 'object',
    properties: {
        file_path: {
            type: 'string',
            description: 'The absolute local path to the file to upload.',
        },
        file_name: {
            type: 'string',
            description: 'Optional: The desired name for the file in Google Drive. Defaults to the original filename.',
        },
        mime_type: {
            type: 'string',
            description: 'Optional: The MIME type of the file (e.g., "image/png", "text/plain"). Will attempt to infer if not provided.',
        },
        folder_id: {
            type: 'string',
            description: 'Optional: The ID of the Google Drive folder to upload the file into. If omitted, uploads to the root folder.',
        },
    },
    required: ['file_path'],
};

// --- Main Server Class ---

class GoogleDriveServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'google-drive-mcp',
                version: '0.1.0',
                description: 'MCP server for interacting with Google Drive (upload, etc.)',
            },
            {
                capabilities: {
                    resources: {}, // No resources defined for now
                    tools: {},     // Tools will be listed dynamically
                },
            }
        );

        this.setupToolHandlers();

        // Basic Error Handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
        process.on('uncaughtException', (error) => {
            console.error('[Uncaught Exception]', error);
            // Consider if graceful shutdown is needed here
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('[Unhandled Rejection]', reason);
             // Consider if graceful shutdown is needed here
        });
    }

    private setupToolHandlers() {
        // --- ListTools Handler ---
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: UPLOAD_FILE_TOOL_NAME,
                    description: 'Uploads a local file to Google Drive and returns its web view link.',
                    inputSchema: UPLOAD_FILE_SCHEMA,
                },
                // Add more tool definitions here later (e.g., create_folder, set_permissions)
            ],
        }));

        // --- CallTool Handler ---
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            if (name === UPLOAD_FILE_TOOL_NAME) {
                return this.handleUploadFile(args);
            }
            // Add handlers for other tools here
            else {
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
            }
        });
    }

    // --- Tool Handler Implementations ---

    private async handleUploadFile(args: any) {
        const filePath = args?.file_path;
        const fileName = args?.file_name || path.basename(filePath); // Default to original filename
        const mimeType = args?.mime_type; // Let Drive API infer if not provided
        const folderId = args?.folder_id; // Optional folder ID

        if (!filePath || typeof filePath !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'file_path (string) is required.');
        }

        try {
            console.log(`Attempting to upload file: ${filePath} as ${fileName}`);

            // Check if file exists locally
            try {
                await fs.promises.access(filePath, fs.constants.R_OK);
            } catch (accessError: unknown) { // Explicitly type as unknown
                const errorMessage = accessError instanceof Error ? accessError.message : String(accessError);
                console.error(`Error accessing file ${filePath}:`, errorMessage);
                throw new McpError(ErrorCode.InvalidRequest, `Cannot read local file: ${filePath}. Error: ${errorMessage}`);
            }

            const fileMetadata: drive_v3.Schema$File = { // Use Schema$File type
                name: fileName,
            };
            if (folderId) {
                fileMetadata.parents = [folderId];
            }

            // Define media object with potential mimeType
            const media: { body: fs.ReadStream; mimeType?: string } = {
                body: fs.createReadStream(filePath), // Create a readable stream
            };
            if (mimeType) {
                media.mimeType = mimeType; // Assign if provided
            }

            const response = await drive.files.create({
                requestBody: fileMetadata,
                media: media,
                fields: 'id, name, webViewLink', // Request specific fields back
            });

            console.log(`File uploaded successfully. ID: ${response.data.id}, Name: ${response.data.name}`);

            if (!response.data.webViewLink) {
                 console.warn(`File uploaded (ID: ${response.data.id}) but no webViewLink was returned.`);
                 // Consider setting permissions explicitly if this happens often
                 // For now, return a message indicating success but no link
                 return {
                    content: [{ type: 'text', text: `File '${response.data.name}' uploaded successfully to Google Drive (ID: ${response.data.id}), but a direct view link could not be generated. You may need to adjust sharing settings.` }],
                 };
            }

            // Return the web view link
            return {
                content: [{ type: 'text', text: `File uploaded successfully: ${response.data.webViewLink}` }],
            };

        } catch (error: any) {
            console.error('Google Drive API Error during upload:', error);
            // Attempt to provide a more specific error message
            const message = error.response?.data?.error?.message || error.message || 'Unknown error during file upload.';
            throw new McpError(ErrorCode.InternalError, `Google Drive API Error: ${message}`);
        }
    }

    // --- Server Execution ---
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Google Drive MCP server running on stdio'); // Log to stderr to avoid interfering with stdout JSON-RPC
    }
}

// --- Start the Server ---
const server = new GoogleDriveServer();
server.run().catch(error => {
    console.error("Failed to start Google Drive MCP server:", error);
    process.exit(1);
});
