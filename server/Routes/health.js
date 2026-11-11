// health routes for NUA server.
// Registered via registerhealth(app, ctx) from app.js.

function registerhealth(app, ctx) {
  const {
    prisma,
    appVersion,
  } = ctx;
  const getUnifi = ctx.getUnifi;

  app.get('/health', async (req, res) => {
    try {
    // Basic health check - verify database connection
      await prisma.$queryRaw`SELECT 1`;
        
      // Check if credentials are configured
      const credentials = await prisma.credentials.findUnique({ where: { id: 1 } });
      const isConfigured = credentials && !credentials.initialSetup;
        
      // Check UniFi connection status
      const unifiConnected = !!getUnifi();
        
      res.status(200).json({ 
        status: 'healthy',
        database: 'connected',
        configured: isConfigured,
        unifiConnected: unifiConnected,
        timestamp: new Date().toISOString(),
        version: appVersion,
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({ 
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString(),
        version: appVersion
      });
    }
  });

}

module.exports = { registerhealth };
