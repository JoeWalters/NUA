// settings routes for NUA server.
// Registered via registersettings(app, ctx) from app.js.

function registersettings(app, ctx) {
  const {
    prisma,
    encrypt,
    decrypt,
    isEncryptionEnabled,
    generateAndSaveKey,
    isDiagnosticsEnabled,
    sendError,
    red,
    fetchLoginInfo,
    logIntoUnifi,
  } = ctx;
  const getUnifi = ctx.getUnifi;

  app.post('/savesitesettings', async (req, res) => {
    const { username, password, hostname, port, sslverify, refreshRate, diagnosticsEnabled } = req.body;
    if (await isDiagnosticsEnabled(prisma)) {
      console.log(req.body);
    }

    red(sslverify, 'teal');
    let sslBool;
    if (sslverify === 'false') {
      sslBool = false;
    } else if (sslverify === 'true') {
      sslBool = true;
    }
    try {
      const encryptedPassword = encrypt(password);
      const siteCredentials = await prisma.credentials.upsert({
        where: { id: 1 },
        update: {
          username,
          password: encryptedPassword,
          hostname,
          port: parseInt(port),
          sslverify: sslBool,
          refreshRate: parseInt(refreshRate),
          diagnosticsEnabled: !!diagnosticsEnabled,
          initialSetup: false
        },
        create: {
          username,
          password: encryptedPassword,
          hostname,
          port: parseInt(port),
          sslverify: sslBool,
          refreshRate: parseInt(refreshRate),
          diagnosticsEnabled: !!diagnosticsEnabled
        }
      });
      res.json({ siteCredentials });
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.put('/updatesitesettings', async (req, res) => {
    const { username, password, hostname, port, sslverify, id, refreshRate, diagnosticsEnabled } = req.body;
    let sslBool;
    if (sslverify === 'false') {
      sslBool = false;
    } else if (sslverify === 'true') {
      sslBool = true;
    }
    try {
      const encryptedPassword = encrypt(password);
      const siteCredentials = await prisma.credentials.update({
        where: {
          id: id,
        },
        data: {
          username: username,
          password: encryptedPassword,
          hostname: hostname,
          port: parseInt(port),
          sslverify: sslBool,
          refreshRate: parseInt(refreshRate),
          diagnosticsEnabled: !!diagnosticsEnabled
        }
      });
      res.json({ message: 'Credentials successfully saved!' });
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.post('/updategeneralsettings', async (req, res) => {
    const { selectDefaultPage } = req.body;
    const updateDefaultPage = await prisma.credentials.update({
      where: {
        id: 1
      },
      data: {
        defaultPage: selectDefaultPage
      }
    });

    res.sendStatus(200);
  });

  app.get('/checkforsettings', async (req, res) => {
    try {
      const checkForSettings = await prisma.credentials.findUnique({ where: { id: 1 }});
      if (checkForSettings) {
        const diag = await isDiagnosticsEnabled(prisma);
        if (diag) {
        // Diagnostics on: expose the full row (including password) for debugging.
          console.log('checkForSettings \t', checkForSettings);
          res.json(checkForSettings);
        } else {
        // Default: return a sanitized view (never expose the password).
          const { password, ...safe } = checkForSettings;
          res.json(safe);
        }
      } else {
        res.sendStatus(404);
      }
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.get('/encryption-status', (req, res) => {
    res.json({ enabled: isEncryptionEnabled() });
  });

  app.post('/enable-encryption', async (req, res) => {
    try {
      if (isEncryptionEnabled()) {
        return res.status(409).json({ error: 'Encryption is already enabled.' });
      }

      // Generate and persist the key
      generateAndSaveKey();

      // Re-encrypt the stored password if one exists
      const creds = await prisma.credentials.findUnique({ where: { id: 1 } });
      if (creds && creds.password && !creds.password.startsWith('ENC:')) {
        const encryptedPassword = encrypt(creds.password);
        await prisma.credentials.update({
          where: { id: 1 },
          data: { password: encryptedPassword }
        });
      }

      res.json({ success: true, message: 'Encryption enabled. Credentials are now encrypted at rest.' });
    } catch (error) {
      console.error('Failed to enable encryption:', error);
      await sendError(res, error, 'Failed to enable encryption.');
    }
  });

  app.get('/testconnection', async (req, res) => {
  // const getAdminLoginInfo = async () => {
  // const unifiTest = new Unifi.Controller({ hostname: loginData.hostname, port: loginData.port,  sslverify: loginData.sslverify });
    try {
    // const adminLogin = await prisma.credentials.findMany();
      const adminLogin = await prisma.credentials.findUnique({ where: { id: 1 }});
      // const login = adminLogin.pop();
      // console.log('adminLogin ', adminLogin);
      console.log('adminLogin: \t ', adminLogin);
      const plainPassword = decrypt(adminLogin.password);
      const unifiTest = new Unifi.Controller({ hostname: adminLogin.hostname, port: adminLogin.port,  sslverify: adminLogin.sslverify });

      // console.log('unifiTest \t', unifiTest);
      const testCredentials = await unifiTest.login(adminLogin.username, plainPassword);
      console.log('Test Credentials: ', testCredentials); // returns true, not login info
      if (testCredentials === true) {
        console.log('🔧 Test connection successful, establishing global UniFi connection...');
            
        // The test already created a connection, so we can reuse the tested controller
        // But let's be explicit and create a fresh connection for the global unifi variable
        try {
          const result = await logIntoUnifi(adminLogin.hostname, adminLogin.port, adminLogin.sslverify, adminLogin.username, plainPassword);
                
          if (result && result.validCredentials) {
            console.log('✅ Successfully established global UniFi connection');
                    
            // Mark setup as complete
            const setInitialSetupFalse = await prisma.credentials.update({ where: { id: 1 }, data: { initialSetup: false } }); 
            console.log('✅ Initial setup completed - UniFi ready for use');
                    
            res.sendStatus(200);
          } else {
            console.error('❌ UniFi login failed despite successful test');
            res.status(500).json({ error: 'UniFi login failed' });
          }
        } catch (unifiError) {
          console.error('❌ Failed to establish UniFi connection:', unifiError);
          await sendError(res, error, 'Failed to establish UniFi connection');
        }
      } else {
        console.log('❌ Test credentials returned:', testCredentials);
        res.status(401).json({ error: 'Invalid credentials' });
      }

    } catch (error) {
    // if (error) throw error;
      if (error) {
        console.log('Catch Error: ', error?.code);
        // res.sendStatus(401);
        res.status(401).json({ message: error?.code });

      // console.log('Catch Error: ', error.request)
      // throw error;
      }
    }
  // }
  // getAdminLoginInfo();
  });

  app.get('/debug-status', async (req, res) => {
    try {
      const credentials = await prisma.credentials.findUnique({ where: { id: 1 }});
      res.json({
        unifiConnected: !!getUnifi(),
        initialSetup: credentials?.initialSetup,
        hasCredentials: !!(credentials?.hostname && credentials?.username && credentials?.password),
        credentials: {
          hostname: credentials?.hostname || 'not set',
          username: credentials?.username ? 'configured' : 'not set',
          password: credentials?.password ? 'configured' : 'not set',
          port: credentials?.port
        }
      });
    } catch (error) {
      await sendError(res, error);
    }
  });

  app.post('/reinitialize-connection', async (req, res) => {
    try {
      console.log('🔄 Reinitializing UniFi connection...');
        
      const loginData = await fetchLoginInfo();
        
      if (!loginData) {
        return res.status(400).json({ error: 'No credentials found' });
      }
        
      // Check if credentials are configured and setup is complete
      if (loginData.hostname && loginData.username && loginData.password && !loginData.initialSetup) {
        console.log('🔧 Attempting to establish UniFi connection...');
            
        const result = await logIntoUnifi(loginData.hostname, loginData.port, loginData.sslverify, loginData.username, loginData.password);
            
        if (result && result.validCredentials) {
          console.log('✅ UniFi connection reinitialized successfully');
          res.json({ 
            message: 'UniFi connection reinitialized successfully', 
            connected: true,
            initialSetup: false
          });
        } else {
          console.log('❌ UniFi connection failed');
          res.status(500).json({ error: 'UniFi connection failed', connected: false });
        }
      } else if (loginData.initialSetup) {
        res.status(400).json({ 
          error: 'Initial setup not complete',
          message: 'Please complete setup first',
          initialSetup: true
        });
      } else {
        res.status(400).json({ error: 'UniFi credentials not properly configured' });
      }
    } catch (error) {
      console.error('❌ Reinitialize connection error:', error);
      const diag = await isDiagnosticsEnabled(prisma);
      res.status(500).json(diag ? { error: error.message, connected: false } : { error: 'UniFi connection failed', connected: false });
    }
  });

  app.post('/connect-unifi', async (req, res) => {
    try {
      if (getUnifi()) {
        return res.json({ message: 'UniFi already connected', connected: true });
      }

      const loginData = await fetchLoginInfo();
        
      if (!loginData || !loginData.hostname || !loginData.username || !loginData.password) {
        return res.status(400).json({ error: 'UniFi credentials not configured' });
      }

      console.log('🔧 Attempting manual UniFi connection...');
      const result = await logIntoUnifi(loginData.hostname, loginData.port, loginData.sslverify, loginData.username, loginData.password);
        
      if (result && result.validCredentials) {
        console.log('✅ Manual UniFi connection successful');
            
        // Also fix the initialSetup flag if needed
        if (loginData.initialSetup) {
          await prisma.credentials.update({ 
            where: { id: 1 }, 
            data: { initialSetup: false } 
          });
          console.log('🔧 Updated initialSetup flag to false');
        }
            
        res.json({ message: 'UniFi connection established', connected: true });
      } else {
        console.log('❌ Manual UniFi connection failed');
        res.status(500).json({ error: 'UniFi connection failed', connected: false });
      }
    } catch (error) {
      console.error('❌ Manual UniFi connection error:', error);
      const diag = await isDiagnosticsEnabled(prisma);
      res.status(500).json(diag ? { error: error.message, connected: false } : { error: 'UniFi connection failed', connected: false });
    }
  });

  app.get('/getcurrenttheme', async (req, res) => {
    try {
      const getTheme = await prisma.credentials.findUnique({
        where: {
          id: 1
        }
      });
      const { theme } = getTheme;
      // console.log('theme: ', theme);
      res.json(theme);
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });

  app.put('/updatetheme', async (req, res) => {
    try {
      const updateTheme = await prisma.credentials.update({
        where: {
          id: 1,
        },
        data: { theme: req.body.theme }
      });
      res.json(updateTheme);
    } catch (error) {
      console.error(error);
      await sendError(res, error, 'Internal server error.');
    }
  });
}

module.exports = { registersettings };
