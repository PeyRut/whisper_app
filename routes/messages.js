// Node.js backend code for Message Creation Endpoint
// Using Express.js framework and a conceptual database connection pool 'db'
// Assumes 'db' is configured with connection pooling for efficient database interaction
// Install necessary packages: npm install express pg crypto csurf body-parser cookie-parser express-validator --save

const express = require('express');
const { randomBytes } = require('crypto');
const bodyParser = require('body-parser'); // Middleware to parse request body
const cookieParser = require('cookie-parser'); // Middleware to parse cookies
const csurf = require('csurf'); // Middleware for CSRF protection
const { body, validationResult } = require('express-validator'); // For input sanitization/validation on request body
const { validateMessageInput } = require('../utils/validation'); // Our custom, detailed validation module (includes config range checks)
const db = require('../config/db'); // Database connection pool module
const logger = require('../utils/logger'); // Logging module
const messageRetrievalRouter = require('../message_retrieval_api'); // Import the retrieval router

const router = express.Router();

// Configuration constants (move to a separate config file or env variables in a real application)
const TOKEN_BYTE_LENGTH = 32; // 32 bytes for a 256-bit token entropy
const MIN_EXPIRATION_MINUTES = 5; // Minimum 5 minutes, matches client
const MAX_EXPIRATION_MINUTES = 7 * 24 * 60; // 7 days in minutes, matches client

// Middleware setup for this router
router.use(bodyParser.json()); // Parse JSON request bodies
router.use(cookieParser()); // Parse standard cookies

// 1. CSRF Protection Middleware
// Needs to be applied *after* bodyParser and cookieParser
// cookie: true means it will use a cookie to store the secret
// value: req => req.body._csrf || req.headers['x-csrf-token'] || // Custom logic to find token in body/header
// We expect the token in req.headers['x-csrf-token'] based on frontend message-service.js
const csrfProtection = csurf({
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        httpOnly: true, // Prevent client-side JavaScript access to the cookie
        sameSite: 'lax', // Recommended for CSRF cookies
    },
    // Tell csurf where to look for the token in the request
    value: (req) => {
        // Check header first, then body
        return req.headers['x-csrf-token'] || req.body._csrf;
    }
});

// Apply CSRF protection ONLY to the state-changing POST / endpoint
router.post('/', 
    // 7. Rate Limiting: Apply rate limiting to this endpoint.
    // This is where you would insert rate-limiting middleware, BEFORE csrfProtection.
    // Example using express-rate-limit:
    // const rateLimit = require('express-rate-limit');
    // const messageCreationLimiter = rateLimit({
    //    windowMs: 60 * 60 * 1000, // 1 hour
    //    max: 10, // Limit each IP to 10 message creation requests per hour (adjust as needed for your use case)
    //    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    //    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    //    message: { status: 'error', message: 'Too many messages created from this IP, please try again after an hour.'}
    // });
    // The actual router line would become:
    // router.post('/', messageCreationLimiter, csrfProtection, [
    //   // ...validation middleware...
    // ], async (req, res) => { /* ... handler logic ... */ });
    csrfProtection,
    // 2. Server-Side Input Validation: Use express-validator for initial checks, then our custom module for detailed validation
    [
        // Basic presence and type checks using express-validator
        body('encrypted_content').exists().isString().withMessage('encrypted_content is required and must be a string.'),
        body('expiration_duration_minutes').exists().isInt({ gt: 0 }).withMessage('expiration_duration_minutes is required and must be a positive integer.'),
        body('is_one_time_view').exists().isBoolean().withMessage('is_one_time_view is required and must be a boolean.'),

        // 2. Server-Side Input Validation: You could add explicit checks for Base64 format here if needed,
        // but the combined check in validateMessageInput and Buffer.from is sufficient for security.
        // You could also add length checks here, but they are in validateMessageInput.
    ],
    async (req, res) => {
        // 2. Handle validation errors from express-validator
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // 8. Logging: Log validation failures
            logger.warn('Express-validator failed for message creation request:', { errors: errors.array() });
            return res.status(400).json({ errors: errors.array() }); // Return specific validation errors to the client
        }

        const { encrypted_content, expiration_duration_minutes, is_one_time_view } = req.body;

        // 2. Server-Side Input Validation: Perform detailed validation using our custom utility
         const validationErrors = validateMessageInput(
             { encrypted_content, expiration_duration_minutes, is_one_time_view },
             { min_expiration: MIN_EXPIRATION_MINUTES, max_expiration: MAX_EXPIRATION_MINUTES } // Pass configuration limits
         );

         if (validationErrors.length > 0) {
             // 8. Logging: Log custom validation failures
             logger.warn('Custom validation failed for message creation request:', { errors: validationErrors });
             return res.status(400).json({ errors: validationErrors }); // Return specific validation errors
         }

        let client; // Database client for transaction
        try {
            // 2. Unique Link Generation (Secure Token)
            // Generate a cryptographically secure random token
            // crypto.randomBytes ensures high entropy and unpredictability
            // base64url encoding ensures URL-safe characters for the token without padding issues in URLs.
             // 8. Logging: Avoid logging the full token, log prefix if necessary for debugging
            const token = randomBytes(TOKEN_BYTE_LENGTH).toString('base64url');
            logger.debug(`Generated token prefix: ${token.substring(0,10)}...`);


            // Calculate expiration timestamp
            const expiration_timestamp = new Date(Date.now() + expiration_duration_minutes * 60 * 1000);

            // 3. Storage using a database transaction
            client = await db.connect(); // Get a client from the pool
            await client.query('BEGIN'); // Start transaction

            // Insert into access_link_metadata table
            // 6. SQL Injection Prevention: Using parameterized queries ($1, $2, $3, $4)
            const insertMetadataQuery = `
                INSERT INTO access_link_metadata (token, expiration_timestamp, is_one_time_view, viewed_timestamp, created_at)
                VALUES ($1, $2, $3, NULL, NOW());
            `;
            await client.query(insertMetadataQuery, [token, expiration_timestamp, is_one_time_view]);
            logger.debug(`Inserted metadata for token prefix: ${token.substring(0,10)}...`);


            // Insert into message_content table
            // 6. SQL Injection Prevention: Using parameterized queries ($1, $2)
            const insertContentQuery = `
                INSERT INTO message_content (token, encrypted_content, created_at)
                VALUES ($1, $2, NOW());
            `;
            // Convert Base64 string (validated by validateMessageInput) to a Buffer for BYTEA storage in PostgreSQL
            const encryptedContentBuffer = Buffer.from(encrypted_content, 'base64');
            // 8. Logging: Do NOT log sensitive encrypted content
            await client.query(insertContentQuery, [token, encryptedContentBuffer]);
             logger.debug(`Inserted content for token prefix: ${token.substring(0,10)}...`);


            // 4. Message Retrieval and Deletion Logic: Queueing for secure deletion after view/expiration is handled by the background job.
            // No explicit queueing needed *immediately* after creation here, as the background job scans based on timestamps/flags.

            await client.query('COMMIT'); // Commit the transaction
            logger.debug(`Transaction committed for token prefix: ${token.substring(0,10)}...`);


            // 4. Response
            // Return the generated token. The frontend will construct the full link
            // including the client-side generated encryption key in the URL fragment.
            res.status(201).json({ token: token });

        } catch (error) {
            // 5. Error Handling
            // Avoid logging req.body.encrypted_content directly in error messages that might be passed around.
            // Use a generic identifier or already logged token prefix if available.
            const logIdentifier = req.body && req.body.encrypted_content ? `(content prefix: ${req.body.encrypted_content.substring(0, 10)}...)` : '(unknown content)';

            if (client) {
                try {
                    await client.query('ROLLBACK'); // Rollback transaction on any error
                    // 8. Logging: Log the rollback and the error details internally.
                    logger.error(`Database transaction rolled back due to error for message creation ${logIdentifier}`, { errorMessage: error.message, stack: error.stack });
                } catch (rollbackError) {
                     // 8. Logging: Log rollback errors
                    logger.error(`Error during database transaction rollback for message creation ${logIdentifier}`, {originalError: error.message, rollbackErrorMessage: rollbackError.message, rollbackStack: rollbackError.stack });
                }
            } else {
                 // 8. Logging: Log database connection/acquisition errors
                 logger.error(`Database connection/acquisition failed for message creation ${logIdentifier}`, { errorMessage: error.message, stack: error.stack });
            }
            // Return a generic internal server error status and message to the client
            res.status(500).json({ errors: [{ msg: 'Internal server error during message creation.' }] });
        } finally {
            // Ensure the client is always released back to the pool, even if errors occurred
            // Check if client was successfully obtained and is not already ending/released by rollback error handling
            if (client && !client._ending) {
                client.release();
                const logIdentifier = req.body && req.body.encrypted_content ? `(content prefix: ${req.body.encrypted_content.substring(0, 10)}...)` : '(unknown content)';
                logger.debug(`Database client released for message creation ${logIdentifier}`);
            }
        }
    }
);

// 1. CSRF Protection: Provide a CSRF token for frontend forms/requests
// This endpoint would be hit by the frontend on initial page load or before making a POST request
router.get('/csrf-token', csrfProtection, (req, res) => {
     // 8. Logging: Log that a token was requested (don't log the token itself)
    logger.debug('CSRF token requested by client.');
    // req.csrfToken() is provided by the csurf middleware
    res.json({ csrfToken: req.csrfToken() });
});

// Mount the message retrieval router at the appropriate path (e.g., /api/messages/)
// This means all routes defined in message_retrieval_api.js (like /messages/:token/content)
// will be relative to the path where this router is used.
// Example: If this router is mounted at '/api', the retrieval route is '/api/messages/:token/content'.
// If this router is mounted at '/api/messages', the retrieval route is '/api/messages/:token/content'.
// Assuming the latter based on the file names structure.
router.use('/', messageRetrievalRouter); // Mount the retrieval routes

module.exports = router;
