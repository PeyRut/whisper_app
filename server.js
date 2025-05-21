const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser'); // Required by csurf in messages.js

// Import API routers
const messagesRouter = require('./routes/messages');
const messageRetrievalRouter = require('./message_retrieval_api'); // This seems to be a router too

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
app.use(cookieParser()); // For parsing cookies, needed by CSRF

// Serve static files from the 'public' directory (or root if no public dir strategy)
// For simplicity, serving from root. Create a 'public' subdir for better organization if preferred.
app.use(express.static(path.join(__dirname, '.'))); 

// Mount API routers
app.use('/api/messages', messagesRouter);
// Assuming message_retrieval_api.js exports a router that should be mounted at a base path.
// If it's already defining full paths like '/api/message/:token/content', 
// it might need adjustment or be mounted at root or /api too.
// Based on its content: router.get('/:token/content', ...)
// it expects to be mounted at something like '/api/message' or '/api/messages' for the token part.
// Let's try mounting it under /api/message for clarity, if routes are relative in that file.
// Re-checking message_retrieval_api.js: router.get('/:token/content', ..)
// and it has a comment: "Endpoint specific path relative to the router's mount path (e.g., /api/messages/:token/content)"
// This implies it should be mounted at /api/messages as well, or its routes need to be unique if mounted separately.
// Let's assume it defines routes that are unique enough or it should be merged/mounted carefully.
// The file has: `module.exports = router;` and `router.get('/:token/content', ...)`
// If messagesRouter is at '/api/messages' for POST /, GET /csrf-token
// And messageRetrievalRouter is for GET /:token/content
// Mounting messageRetrievalRouter also at /api/messages will make the path /api/messages/:token/content
app.use('/api/messages', messageRetrievalRouter); 

// Basic error handling (optional, can be expanded)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Default route for index.html (if not automatically served by express.static)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); 