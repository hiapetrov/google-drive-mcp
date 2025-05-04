# Google Drive MCP Server

A Model Context Protocol (MCP) server for interacting with the Google Drive API.

## Features

*   Provides tools to manage files and folders in Google Drive.
*   Currently implements an `upload_file` tool.

## Setup

1.  **Google Cloud Project:**
    *   Ensure you have a Google Cloud project with the Google Drive API enabled.
    *   Create OAuth 2.0 Client ID credentials (Type: Web Application).
    *   Add `http://localhost:3000/callback` as an Authorized redirect URI for the OAuth client.
    *   Note down the Client ID and Client Secret.

2.  **Obtain Refresh Token:**
    https://www.googleapis.com/auth/drive - your Client ID and Secret to obtain a refresh token via user consent flow.

3.  **Configure MCP Settings (`mcp_settings.json`):**
    *   Add or update the `google-drive-mcp` entry:
        ```json
        "google-drive-mcp": {
          "command": "node",
          "args": [
          // Adjust path as needed
          ],
          "env": {
            "GOOGLE_CLIENT_ID": "YOUR_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
            "GOOGLE_REFRESH_TOKEN": "YOUR_OBTAINED_REFRESH_TOKEN"
          },
          "disabled": false,
          "alwaysAllow": ["upload_file"] // Add other tools as needed
        }
        ```

4.  **Build & Run:**
    *   Navigate to the MCP directory.
    *   Run `npm install` if you haven't already.
    *   Run `npm run build`.
    *   The MCP server will be started automatically by the controlling application based on the settings file.

## Available Tools

*   **`upload_file`**: Uploads a local file to Google Drive.
    *   **Input Schema:**
        ```json
        {
          "type": "object",
          "properties": {
            "file_path": {
              "type": "string",
              "description": "The absolute local path to the file to upload."
            },
            "file_name": {
              "type": "string",
              "description": "Optional: The desired name for the file in Google Drive. Defaults to the original filename."
            },
            "mime_type": {
              "type": "string",
              "description": "Optional: The MIME type of the file (e.g., \"image/png\", \"text/plain\"). Will attempt to infer if not provided."
            },
            "folder_id": {
              "type": "string",
              "description": "Optional: The ID of the Google Drive folder to upload the file into. If omitted, uploads to the root folder."
            }
          },
          "required": ["file_path"]
        }
        ```
    *   **Output:** Returns the Google Drive web view link for the uploaded file.
