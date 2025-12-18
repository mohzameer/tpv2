# AI Agent Setup Guide

## Frontend Environment Variables

### Backend API URL Setup

The frontend now uses a backend API to handle Anthropic API calls. This provides:
- ✅ CORS handling
- ✅ Secure API key storage (not exposed in frontend)
- ✅ Model abstraction (easy model swapping)

1. Add the backend URL to your `.env.local` file:
   ```bash
   VITE_BACKEND_URL=http://localhost:3001
   ```

2. Optional: Set a default model (backend can override):
   ```bash
   VITE_AI_MODEL=claude-sonnet-4-5-20250929
   ```

3. The `.env.local` file is already in `.gitignore`, so your configuration won't be committed to git.

4. Restart your Vite dev server after adding the variables.

### Backend Setup

The backend handles the Anthropic API key. See `BACKEND_API_SPEC.md` for complete backend setup instructions.

**Quick Backend Setup:**
1. Create a backend server (see `BACKEND_API_SPEC.md`)
2. Add `ANTHROPIC_API_KEY` to backend `.env` file
3. Set `DEFAULT_AI_MODEL` in backend `.env` (optional)
4. Start backend server on port 3001 (or update `VITE_BACKEND_URL`)

### Verifying Setup

The backend URL will be accessible in your code via:
```typescript
const backendUrl = import.meta.env.VITE_BACKEND_URL
```

### Troubleshooting

- **Backend not found**: Make sure the backend server is running on the port specified in `VITE_BACKEND_URL`
- **CORS Error**: The backend handles CORS. Make sure backend CORS is configured for your frontend URL
- **API Key Error**: Check that `ANTHROPIC_API_KEY` is set in the backend `.env` file
- **Connection Error**: Verify the backend URL is correct and the backend server is running
- **Production**: 
  - Update `VITE_BACKEND_URL` to your production backend URL
  - Ensure backend has `ANTHROPIC_API_KEY` set in production environment
  - Configure backend CORS to allow your production frontend domain

