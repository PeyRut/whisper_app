// Placeholder for database configuration and connection pool

// This is a mock DB client for the application to run without a real database.
// In a production environment, replace this with actual database connection logic (e.g., using pg.Pool).

console.warn('Using mock database. No data will be persisted.');

// In-memory store for messages and metadata
const inMemoryMessages = {}; // { token: { encrypted_content, expiration_timestamp, is_one_time_view, viewed_timestamp } }

const mockClient = {
  query: async (text, params) => {
    console.log('Mock DB Query:', text, params);
    if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) {
      return Promise.resolve();
    }
    if (text.includes('INSERT INTO access_link_metadata')) {
      // Store metadata
      const [token, expiration_timestamp, is_one_time_view] = params;
      if (!inMemoryMessages[token]) inMemoryMessages[token] = {};
      inMemoryMessages[token].expiration_timestamp = expiration_timestamp;
      inMemoryMessages[token].is_one_time_view = is_one_time_view;
      inMemoryMessages[token].viewed_timestamp = null;
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (text.includes('INSERT INTO message_content')) {
      // Store encrypted content
      const [token, encrypted_content] = params;
      if (!inMemoryMessages[token]) inMemoryMessages[token] = {};
      inMemoryMessages[token].encrypted_content = encrypted_content.toString('base64');
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (text.includes('FROM access_link_metadata') && text.includes('FOR UPDATE SKIP LOCKED')) {
      const token = params[0];
      const entry = inMemoryMessages[token];
      // Only allow retrieval if not expired and not already locked
      if (entry && !entry._locked) {
        // Check expiration
        if (entry.expiration_timestamp && new Date(entry.expiration_timestamp) < new Date()) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        // For one-time view, only allow if not yet viewed
        if (entry.is_one_time_view) {
          if (!entry.viewed_timestamp) {
            entry._locked = true; // Simulate row lock for this transaction
            return Promise.resolve({
              rows: [{
                expiration_timestamp: entry.expiration_timestamp,
                is_one_time_view: entry.is_one_time_view,
                viewed_timestamp: entry.viewed_timestamp,
              }],
              rowCount: 1,
            });
          } else {
            return Promise.resolve({ rows: [], rowCount: 0 });
          }
        } else {
          // Multi-use: always allow retrieval if not expired
          entry._locked = true;
          // Release lock immediately for multi-use
          setTimeout(() => { entry._locked = false; }, 0);
          return Promise.resolve({
            rows: [{
              expiration_timestamp: entry.expiration_timestamp,
              is_one_time_view: entry.is_one_time_view,
              viewed_timestamp: entry.viewed_timestamp,
            }],
            rowCount: 1,
          });
        }
      } else {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
    }
    if (text.includes('UPDATE access_link_metadata SET viewed_timestamp')) {
      const token = params[0];
      const entry = inMemoryMessages[token];
      if (entry && entry._locked) {
        if (entry.is_one_time_view) {
          entry.viewed_timestamp = new Date();
          // Simulate destruction: remove encrypted content and metadata after view
          setTimeout(() => { delete inMemoryMessages[token]; }, 0); // Remove after transaction
        }
        entry._locked = false;
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.resolve({ rowCount: 0 });
    }
    if (text.includes('SELECT encrypted_content') && text.includes('FROM message_content') && text.includes('WHERE token = $1')) {
      const token = params[0];
      const entry = inMemoryMessages[token];
      if (entry && entry.encrypted_content) {
        return Promise.resolve({
          rows: [{ encrypted_content: Buffer.from(entry.encrypted_content, 'base64') }],
          rowCount: 1,
        });
      } else {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
    }
    // Default empty response for other SELECT queries
    return Promise.resolve({ rows: [], rowCount: 0 });
  },
  release: () => console.log('Mock DB Client released.'),
  _ending: false, // a property real pg client has
};

module.exports = {
  connect: async () => {
    console.log('Mock DB Client connected.');
    return Promise.resolve(mockClient);
  },
  // If you were using pg.Pool directly, you might export the pool:
  // pool: new Pool ({ ... your config ... })
}; 