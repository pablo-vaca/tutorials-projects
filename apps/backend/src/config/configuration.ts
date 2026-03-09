export default () => ({
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] || 'development',
  mongoDbUri: process.env['MONGO_DB_URI'] || '',
});