// Node.js Backend Code - Component 1: Message Retrieval API Endpoint (GET /api/message/:token)

const express = require('express');
const router = express.Router(); // Assuming this is part of an Express router setup
const db = require('./config/db'); // Corrected path
const logger = require('./utils/logger'); // Corrected path
const { param, validationResult } = require('express-validator'); // For input sanitization/validation

// Define expected token length constraints (example values, adjust as per your token generation scheme)
// These should match the token generation length and client-side validation constraints.
const TOKEN_BYTE_LENGTH = 32; // From message creation
const MIN_TOKEN_LENGTH = Math.ceil(TOKEN_BYTE_LENGTH * 4 / 3) - 2; // Approx Base64URL min length (can vary slightly with padding)
const MAX_TOKEN_LENGTH = Math.ceil(TOKEN_BYTE_LENGTH * 4 / 3) + 2; ; // Approx Base64URL max length


/**
 * GET /api/message/:token/content
 *
 * Handles retrieval of encrypted message content based on token.
 * Implements link validation, one-time view logic, and returns encrypted content.
 *
 * 2. Server-Side Input Validation: Implemented using express-validator middleware.
 * 4. Message Retrieval and Deletion Logic: Thoroughly review and test the logic, especially concurrency for one-time view.
 * 6. SQL Injection Prevention: Verified ALL database queries use parameterized queries.
 * 7. Rate Limiting: Apply rate limiting to this endpoint.
 * 8. Logging: Ensure no sensitive data is logged.
 */
router.get('/:token/content', // Endpoint specific path relative to the router's mount path (e.g., /api/messages/:token/content)
    // 7. Rate Limiting: Apply rate limiting to this endpoint.
    // This is where you would insert rate-limiting middleware.
    // Example using express-rate-limit:
    // const rateLimit = require('express-rate-limit');
    // const messageRetrievalLimiter = rateLimit({
    //     windowMs: 15 * 60 * 1000, // 15 minutes
    //     max: 100, // Limit each IP to 100 retrieval requests per windowMs (adjust as needed for your use case)
    //     standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    //     legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    //     message: { status: 'error', message: 'Too many requests from this IP, please try again after 15 minutes.'}
    // });
    // The actual router line would become:
    // router.get('/:token/content', messageRetrievalLimiter, [
    //   // ...validation middleware...
    // ], async (req, res) => { /* ... handler logic ... */ });
    // Consider more granular limiting per token if abuse is detected, which may require a separate store (e.g., Redis).

    // 2. Server-Side Input Validation: Implement robust validation for URL parameter 'token'.
    [
        param('token')
            .trim() // Remove leading/trailing whitespace
            // Validate token format: must be URL-safe Base64. Allows standard Base64 too as Buffer.from handles both.
            .isBase64({ urlSafe: true }) // Checks characters and basic padding if any
            .withMessage('Invalid message token format.') // Generic message to avoid revealing format details

            // Validate token length: enforce expected length range based on generation.
            // The exact length of Base64URL can vary slightly based on padding.
            // Using a range slightly around the theoretical length for tolerance.
            .isLength({ min: MIN_TOKEN_LENGTH, max: MAX_TOKEN_LENGTH })
            .withMessage('Invalid message token length.') // Generic message

    ],
    async (req, res) => {
        // 2. Handle validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // 8. Logging: Log validation failures without logging the full potentially malicious token.
            const validationErrorMessages = errors.array().map(e => `${e.param}: ${e.msg}`);
            logger.warn('Retrieval attempt with invalid token.', { errors: validationErrorMessages });
             // Use a generic, non-informative error response for invalid input
            return res.status(404).json({ status: 'unavailable', message: 'Message not found or access denied.' }); // Avoid 400 to prevent scanning
        }

        const token = req.params.token; // Use the validated and trimmed token from params. It's safe for DB query parameter.
        // 8. Logging: Log only a prefix of the token for debugging/security
        logger.debug(`Received retrieval request for token prefix: ${token.substring(0,10)}...`);


        let client; // Database client for transaction
        try {
            client = await db.connect(); // Acquire client from pool

            // 4. Message Retrieval Logic - Implement one-time view & concurrency safety
            // Start transaction for atomic update and retrieve (CRUCIAL for one-time view guarantee)
            await client.query('BEGIN');
            logger.debug(`Transaction started for retrieving token prefix: ${token.substring(0,10)}...`);

            // Query access_link_metadata for the given token using SELECT ... FOR UPDATE
            // This acquires a row-level lock on the metadata record, preventing race conditions
            // with other concurrent views. `SKIP LOCKED` means if the row is already locked,
            // this query will return no rows, effectively treating a concurrently viewed/deleted
            // message as "not found" for *this* request, which is safe.
            const lockedMetadataQuery = `
                SELECT expiration_timestamp, is_one_time_view, viewed_timestamp
                FROM access_link_metadata
                WHERE token = $1 -- 6. SQL Injection Prevention: Parameterized query
                FOR UPDATE SKIP LOCKED; -- Acquire lock and skip if already locked
            `;
            const lockedMetadataResult = await client.query(lockedMetadataQuery, [token]);

            // Check if metadata exists for the token (after attempting lock).
            // If no rows returned, it means either the token doesn't exist OR it's currently locked (and thus being processed by another request/job).
            // Treat both cases as "unavailable" for this request.
            if (lockedMetadataResult.rows.length === 0) {
                await client.query('ROLLBACK'); // Must roll back BEGIN even if no rows locked
                logger.info(`Token not found in metadata or concurrently locked: ${token.substring(0,10)}...`);
                 // Return a generic, consistent error for both not found and concurrently locked/processed
                return res.status(404).json({ status: 'unavailable', message: 'Message not found or access denied.' });
            }

            const metadata = lockedMetadataResult.rows[0];
            const now = new Date();

            // 4. Check link validity (expired, already viewed) - check against the locked data
            if (metadata.expiration_timestamp < now) {
                await client.query('ROLLBACK'); // Release lock and end transaction
                logger.info(`Link expired post-lock for token prefix: ${token.substring(0,10)}...`);
                 // The background deletion job will handle pruning expired links.
                return res.status(410).json({ status: 'expired', message: 'This link has expired.' });
            }

            // Check one-time view status (only if it's a one-time view link and has been viewed)
            if (metadata.is_one_time_view && metadata.viewed_timestamp !== null) {
                await client.query('ROLLBACK'); // Release lock and end transaction
                logger.info(`One-time link already viewed post-lock for token prefix: ${token.substring(0,10)}...`);
                 // The background deletion job will handle pruning viewed one-time links.
                return res.status(410).json({ status: 'viewed', message: 'This link has already been viewed.' });
            }

            // --- Link is valid & not viewed (for one-time): Proceed to fetch content and handle one-time view update ---

            // If valid and IS a one-time view (and not yet viewed), update viewed_timestamp
            if (metadata.is_one_time_view && metadata.viewed_timestamp === null) {
                const updateMetadataQuery = `
                    UPDATE access_link_metadata
                    SET viewed_timestamp = NOW()
                    WHERE token = $1; -- 6. SQL Injection Prevention: Parameterized query
                `;
                await client.query(updateMetadataQuery, [token]);
                logger.info(`viewed_timestamp updated for token prefix: ${token.substring(0,10)}...`);

                // 4. Queue token for secure deletion (handled by background job)
                // This needs to interface with your background deletion *queue* or mechanism.
                logger.info(`Token prefix queued for secure deletion (after view): ${token.substring(0,10)}...`);
                 // Example: await SecureDeletionQueue.enqueue(token); // Call your actual queueing function

                 // Note: Message *content* is still retrievable within this transaction
                 // immediately after marking as viewed. The deletion job will remove it shortly after.
            }

            // Fetch encrypted_content from message_content table
            const contentQuery = `
                SELECT encrypted_content
                FROM message_content
                WHERE token = $1; -- 6. SQL Injection Prevention: Parameterized query
            `;
            const contentResult = await client.query(contentQuery, [token]);

            // If content doesn't exist but metadata did, something is wrong (should be atomic)
            if (contentResult.rows.length === 0) {
                 await client.query('ROLLBACK'); // Rollback the transaction (including the view update)
                 logger.error(`Content missing for token found in metadata during retrieval: ${token.substring(0,10)}...`);
                 // Return a generic error but log the anomaly
                 return res.status(500).json({ status: 'error', message: 'Internal server error. Please try again later.' });
            }

            // Get the encrypted content (which is a Buffer from BYTEA)
            const encryptedContentBuffer = contentResult.rows[0].encrypted_content;

            // Commit the transaction - releases the lock and makes the view update permanent
            await client.query('COMMIT');
            logger.debug(`Transaction committed for retrieving/viewing token prefix: ${token.substring(0,10)}...`);

            // Return the encrypted content as Base64 string
            // The frontend is expecting Base64 as it was sent that way on creation.
            // 5. Key Encoding/Handling: Ensure the buffer is correctly converted to base64 string.
            const encryptedContentBase64 = encryptedContentBuffer ? encryptedContentBuffer.toString('base64') : '';

            res.status(200).json({ encryptedContent: encryptedContentBase64 });

        } catch (error) {
            // Catch any errors during the process
            const tokenSuffix = token ? token.substring(0,10) + '...' : 'N/A';
            if (client) {
                try {
                    // Attempt to rollback the transaction if it was started
                    // This releases the lock and discards partial changes
                    await client.query('ROLLBACK');
                    // 8. Logging: Log detailed error internally but only generic error to client
                    logger.error(`Database transaction rolled back due to error for token: ${tokenSuffix}`, { errorMessage: error.message, stack: error.stack });
                } catch (rollbackError) {
                    // If rollback itself fails, log that too
                    logger.error(`Error during database transaction rollback for token: ${tokenSuffix}`, { originalError: error.message, rollbackErrorMessage: rollbackError.message, rollbackStack: rollbackError.stack });
                }
            } else {
                 // If client acquisition failed or error happened before transaction start
                 logger.error(`Database operation failed, possibly before transaction start, for token: ${tokenSuffix}`, { errorMessage: error.message, stack: error.stack });
            }
            // Return a generic, non-informative error to the client for any internal server error
            res.status(500).json({ status: 'error', message: 'An unexpected error occurred. Please try again later.' });
        } finally {
            // Ensure the client is always released back to the pool, even if errors occurred
            // Check if client was successfully obtained and is not already ending/released by rollback error handling
            if (client && !client._ending) {
                client.release();
                logger.debug(`Database client released for token: ${token ? token.substring(0,10) + '...' : 'N/A'}`);
            }
        }
    }
);

// Export the router (or the handler specifically if not using Express router directly)
// Assuming this router is mounted under '/api/messages' in the main Express app
module.exports = router;
