// Placeholder for a more sophisticated logger
// This basic logger just uses console.log, console.warn, console.error

const logger = {
  debug: (...args) => {
    // console.debug(...args); // Or console.log for environments where debug is hidden
    console.log('DEBUG:', ...args);
  },
  info: (...args) => {
    console.info('INFO:', ...args);
  },
  warn: (...args) => {
    console.warn('WARN:', ...args);
  },
  error: (...args) => {
    console.error('ERROR:', ...args);
  },
};

module.exports = logger; 