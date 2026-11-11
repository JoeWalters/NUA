const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const Unifi = require('node-unifi');
const { PrismaClient, Prisma } = require('@prisma/client');
const schedule = require('node-schedule');
const customPORT = require('./globalSettings');
const fs = require('fs');
const { ezScheduleRoutes } = require('./Routes/scheduler_routes/ezScheduleRoutes'); // ezScheduleRoutes(app, unifi, prisma)
const { red } = require('./server_util_funcs/red');
const { jobFunction } = require('./server_util_funcs/jobfunction');
const { updateOneTimeSchedule } = require('./ez_sched_funcs/update_ez_schedules/updateOneTimeSchedule');
const { updateRecurringSchedule } = require('./ez_sched_funcs/update_ez_schedules/updateRecurringSchedule');
const { serverLogger } = require('./server_util_funcs/server_log_utils/serverLogger');
const { validateCron } = require('./server_util_funcs/validateCron');
const { consoleReader } = require('./server_util_funcs/server_log_utils/consoleReader');
const { logger } = require('./server_util_funcs/server_log_utils/customLogger');
const { cronBonusTimeEndJobReinitiation } = require('./server_util_funcs/cronBonusTimeEndJobReinitiation');
const { easyBonusTimeEndJobReinitiation } = require('./server_util_funcs/easyBonusTimeEndJobReinitiation');
const { minutesHoursToMilli } = require('./server_util_funcs/minutesHoursToMilli');
const { convertToMilitaryTime } = require('./server_util_funcs/convert_to_military_time');
const { dateFromDateString } = require('./server_util_funcs/ez_sched_utils/dateFromDateString');
const { startTimeout, endTimeout, timeoutMap } = require('./server_util_funcs/start_&_clear_timeouts/start_end_timeouts');
const { stopBonusTime } = require('./server_util_funcs/stop_bonus_time/stopBonusTimeViaToggleOff');
const { encrypt, decrypt, isEncryptionEnabled, generateAndSaveKey } = require('./server_util_funcs/credentialCrypto');
const { version: appVersion } = require('./package.json');
const schedulerService = require('./scheduler/service'); // Central scheduler service (Phase 3)
const { startBonusTime, deleteBonusToggles, restartPausedJobs: bonusRestartPausedJobs, clearBonusTimeExpiry, reArmDeviceBonusOnBoot } = require('./scheduler/bonusScheduler'); // Bonus time scheduler (Phase 5)
const { startBonusRule, endBonusRule, reArmTrafficBonusOnBoot } = require('./scheduler/trafficBonusScheduler'); // Traffic rule bonus scheduler
const { addTrafficRuleSchedule, toggleTrafficRuleSchedule, deleteTrafficRuleSchedule, reArmTrafficRuleSchedulesOnBoot } = require('./scheduler/trafficRuleScheduler'); // Traffic rule schedules
const asyncHandler = require('./server_util_funcs/asyncHandler');
const auth = require('./server_util_funcs/auth');
const { isDiagnosticsEnabled } = require('./server_util_funcs/diagnostics');

// Route modules (split out of the original monolithic app.js). Each registers
// its routes on the shared `app` and reads shared dependencies from `ctx`.
const { registerhealth } = require('./Routes/health');
const { registerdevices } = require('./Routes/devices');
const { registerschedules } = require('./Routes/schedules');
const { registersettings } = require('./Routes/settings');
const { registerdevicegroups } = require('./Routes/device-groups');
const { registertrafficrules } = require('./Routes/traffic-rules');

const prisma = new PrismaClient();

// Send a 500 response. The raw error message is only exposed when diagnostics
// are enabled (Settings modal); otherwise a generic message is returned and the
// full error is logged server-side only.
async function sendError(res, error, message = 'Internal server error.') {
  console.error(error);
  try {
    const diag = await isDiagnosticsEnabled(prisma);
    return res.status(500).json(diag
      ? { error: message, details: error && error.message }
      : { error: message });
  } catch (e) {
    return res.status(500).json({ error: message });
  }
}

// Resolved project root directory (avoids fragile string slicing of process.cwd())
const PROJECT_ROOT = path.resolve(__dirname, '..');

// create server & add middleware
const app = express();

// Restrict cross-origin access. Same-origin requests (no Origin header, i.e.
// the app's own frontend served from this Express server) are always allowed.
// Cross-origin requests are blocked unless explicitly allowed via
// NUA_CORS_ORIGIN (comma-separated list of allowed origins).
const allowedOrigins = (process.env.NUA_CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) {
      return cb(null, true);
    }
    return cb(null, allowedOrigins.includes(origin));
  }
}));
// Security headers (CSP, X-Content-Type-Options, frame protection, etc.).
// The app runs over plain HTTP on local networks, so we drop the CSP
// 'upgrade-insecure-requests' directive -- it rewrites http:// asset requests
// to https://, which breaks page loading when there is no TLS in front.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'upgrade-insecure-requests': null,
    },
  },
}));
// Explicit JSON body limit (default is 100kb; traffic-rule payloads can exceed it)
app.use(express.json({ limit: '1mb' }));

// Serve the SPA shell (index.html) with cache-busting headers. iOS mobile
// browsers cache aggressively and can end up with a stale index.html that
// references old hashed asset files, which produces a blank page. no-cache /
// no-store forces the browser to revalidate the shell on every load so it
// always requests the current asset hashes.
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(PROJECT_ROOT, 'dist', 'index.html'));
});

app.use(express.static(path.join(PROJECT_ROOT, 'dist')));
consoleReader(schedule);

// ---- Error handling & optional authentication (route registration layer) ----
// Express 4 does not catch rejected promises from async handlers, which leaves
// client requests hanging with no response. Wrap every registered handler in
// asyncHandler so rejections flow to the global error middleware below.
// When auth is enabled (NUA_AUTH_ENABLED=true), also inject requireAuth in front
// of every non-public route. Public routes (login/logout/auth-status/health and
// the SPA fallback) stay reachable so the login page can always be served.
const _appGet = app.get.bind(app);
const _appPost = app.post.bind(app);
const _appPut = app.put.bind(app);
const _appDelete = app.delete.bind(app);

function registerWithAuth(method, path, handlers) {
  const wrapped = handlers.map((h) => asyncHandler(h));
  const protectedRoute = auth.isEnabled() && !auth.PUBLIC_PATHS.has(path);
  return protectedRoute ? [auth.requireAuth, ...wrapped] : wrapped;
}

app.get = (p, ...handlers) => handlers.length ? _appGet(p, ...registerWithAuth('get', p, handlers)) : _appGet(p);
app.post = (p, ...handlers) => handlers.length ? _appPost(p, ...registerWithAuth('post', p, handlers)) : _appPost(p);
app.put = (p, ...handlers) => handlers.length ? _appPut(p, ...registerWithAuth('put', p, handlers)) : _appPut(p);
app.delete = (p, ...handlers) => handlers.length ? _appDelete(p, ...registerWithAuth('delete', p, handlers)) : _appDelete(p);

// Rate-limit the login endpoint (brute-force protection).
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts, please try again later.' } });
app.use('/login', loginLimiter);

// ---- Auth routes ----
app.post('/login', auth.login);
app.post('/logout', auth.logout);
app.get('/auth-status', auth.status);

// Rate limiters (Fix 11)
const settingsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many requests, please try again later.' } });
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'Too many requests, please try again later.' } });
app.use('/savesitesettings', settingsLimiter);
app.use('/updatesitesettings', settingsLimiter);
app.use('/testconnection', settingsLimiter);
app.use('/updatemacaddressstatus', actionLimiter);
app.use('/blockallmacs', actionLimiter);
app.use('/unblockallmacs', actionLimiter);
app.use('/unblockmac', actionLimiter);
app.use('/addmacaddresses', actionLimiter);

function handleLoginError(error) {
  if (error !== undefined) {
    console.log('handleLoginErrors: \t');
    console.log('Error \t', error);
    console.log(error?.code);
    console.log(error?.response?.data?.code);
    console.log(error?.response?.data?.message);
  }
  red('There was an error logging in with your credentials. Set them up in /sitesettings!', 'cyan');
}
// function writeJSONApps(successfulData) {
//     // const data = JSON.stringify(successfulData);
//     const data = successfulData;
//     fs.appendFile('successfulIds.js', `${data}\n`, (error) => {
//         if (error) {
//             console.error(error);
//         } else {
//             console.log('The file has been saved!');
//         }
//     });
// }

// initial check for existing credentials in db
const checkForCredentials = async () => {
  try {
    const creds = await prisma.credentials.findUnique({
      where: {
        id: 1
      }
    });
    if (creds === null) {
      const initialSiteCredentials = await prisma.credentials.create({
        data: {
          username: '',
          password: '',
          hostname: '',
          port: 443,
          sslverify: false,
          refreshRate: 60000,
          theme: 'dark',
          defaultPage: '/',
          initialSetup: true
        }
      });
    } else {
      red('Credentials already exist!', 'teal');
      return;
    }
  } catch (error) {
    console.error(error);
  }
};
checkForCredentials();

// unifi connection instance // original
// let unifi;
// async function logIntoUnifi(hostname, port, sslverify, username, password) {
//     unifi = new Unifi.Controller({ hostname: hostname, port: port, sslverify: sslverify });
//     const loginData = await unifi.login(username, password);
//     if (loginData) {
//         return { unifi, validCredentials: true };
//     } else {
//         return { validCredentials: false };
//     }
// }

// new
async function logIntoUnifi(hostname, port, sslverify, username, password) {
  if (isConnecting) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  isConnecting = true;
  try {
    unifi = new Unifi.Controller({hostname: hostname, port: port, sslverify: sslverify});
    const loginData = await unifi.login(username, password);
    if (loginData) {
      return { unifi, validCredentials: true };
    } else {
      return { validCredentials: false };
    }
  } finally {
    isConnecting = false;
  }
}

function isUnauthorizedUnifiError(error) {
  return error?.response?.status === 401 || error?.response?.data?.code === 401;
}

async function reAuthenticateUnifi() {
  const loginData = await fetchLoginInfo();
  if (!loginData?.hostname || !loginData?.username || !loginData?.password) {
    throw new Error('UniFi credentials not configured. Please configure credentials at /sitesettings');
  }

  const result = await logIntoUnifi(
    loginData.hostname,
    loginData.port,
    loginData.sslverify,
    loginData.username,
    loginData.password
  );

  if (!result?.validCredentials) {
    throw new Error('Failed to re-authenticate with UniFi controller');
  }

  return true;
}

async function withUnifiRetry(requestFn) {
  if (!unifi) {
    await reAuthenticateUnifi();
  }

  try {
    return await requestFn();
  } catch (error) {
    if (!isUnauthorizedUnifiError(error)) {
      throw error;
    }

    console.warn('UniFi request returned 401. Attempting to re-authenticate and retry once.');
    await reAuthenticateUnifi();
    return requestFn();
  }
}

// Wrapped UniFi request helper for scheduled jobs. Reads the module-scoped
// `unifi` at call time (never a stale captured reference) and re-authenticates
// + retries once on 401, mirroring withUnifiRetry for HTTP routes. Passing this
// to the scheduler modules lets scheduled jobs survive an expired UniFi session
// instead of crashing the process.
const unifiRequest = async (path, method, payload) =>
  withUnifiRetry(() => unifi.customApiRequest(path, method, payload));

// fetch login arguments // original
// let loginData;
// const fetchLoginInfo = async () => {
//     const getAdminLoginInfo = async () => {
//         try {
//           const adminLogin = await prisma.credentials.findUnique({ where: { id: 1 }});
//         //   console.log('adminLogin \t', adminLogin);
//         //   loginData = adminLogin.pop();
//           loginData = adminLogin;
//           return loginData;
//         } catch (error) {
//             if (error) {
//                 console.error('getAdminLoginInfo error in fetchLoginInfo: ', error);
//                 throw new Error('No credentials were found');
//             }
//         }
//     }
//     return getAdminLoginInfo();
// }

// new
const fetchLoginInfo = async () => {
  try {
    const loginData = await prisma.credentials.findUnique({ where: { id: 1 }});
    if (loginData) {
      return { ...loginData, password: decrypt(loginData.password) };
    } else {
      throw Error('Could NOT FETCH LOGIN DATA.');
    }
  } catch (error) {
    console.error('getAdminLoginInfo error in fetchLoginInfo: ', error);
    throw new Error('No credentials were found');
  }
};

let isConnecting = false;
let unifi;
const init = async () => {
  try {
    // Ensure credentials record exists
    await checkForCredentials();
        
    const loginData = await fetchLoginInfo();
        
    // Check if credentials are actually configured (not just empty) and initial setup is complete
    if (loginData && loginData.hostname && loginData.username && loginData.password && !loginData.initialSetup) {
      console.log('Attempting to connect to UniFi controller...');
      await logIntoUnifi(loginData?.hostname, loginData?.port, loginData?.sslverify, loginData?.username, loginData?.password);
      console.log('✅ Successfully connected to UniFi controller');
    } else if (loginData && loginData.initialSetup) {
      console.log('⚠️ Initial setup required. Please complete setup at /sitesettings');
      unifi = null;
    } else {
      console.log('⚠️ UniFi credentials not configured. Please set them up at /sitesettings');
      unifi = null;
    }
        
    // Always initialize routes, even without UniFi connection
    ezScheduleRoutes(app, unifi, prisma, schedule, jobFunction);
        
  } catch (error) {
    console.error('⚠️ Could not establish UniFi connection:', error.message);
    console.log('🌐 Application will start without UniFi connection. Configure credentials at /sitesettings');
        
    // Set unifi to null and continue - app can still serve the web interface
    unifi = null;
    ezScheduleRoutes(app, unifi, prisma, schedule, jobFunction);
  }
};
const initPromise = init();
// console.log('unifi\t', unifi);

// info
//     .then(() => logIntoUnifi(loginData?.hostname, loginData?.port, loginData?.sslverify, loginData?.username, loginData?.password))
//     .then(() => console.log('.then() => unifi \t'))
//     .catch((error) => console.error(error))

async function getBlockedUsers() {
  try {
    const blockedUsers = await withUnifiRetry(() => unifi.getBlockedUsers());
    if (blockedUsers === undefined) {
      return [];
    } else {
      return blockedUsers;
    }
  } catch (error) {
    if (isUnauthorizedUnifiError(error)) {
      console.warn('UniFi blocked-users request unauthorized (401). Returning empty list.');
      return [];
    }
    console.error('Error getting blocked users:', error.message);
    return [];
  }
}
async function blockMultiple(reqBodyArr) {
  if (!unifi) {
    throw new Error('UniFi controller not connected. Please configure credentials at /sitesettings');
  }
    
  for (const mac of reqBodyArr) {
    try {
      const result = await unifi.blockClient(mac);
      if (typeof result === 'undefined' || result.length <= 0) {
        throw new Error(`blockMultiple(): ${JSON.stringify(result)}`);
      } else {
        console.log(`Successfully blocked: ${mac}`);
      }
    } catch (error) {
      console.error(error);
    }
  }
}
async function unBlockMultiple(reqBodyArr) {
  if (!unifi) {
    throw new Error('UniFi controller not connected. Please configure credentials at /sitesettings');
  }
    
  for (const mac of reqBodyArr) {
    try {
      const result = await unifi.unblockClient(mac);
      if (typeof result === 'undefined' || result.length <= 0) {
        throw new Error(`blockMultiple(): ${JSON.stringify(result)}`);
      } else {
        console.log(`Successfully unblocked: ${mac}`);
      }
    } catch (error) {
      if (error) {
        throw error;
      }
    }
  }
}
async function unblockSingle(reqBodyMac) {
  if (!unifi) {
    throw new Error('UniFi controller not connected. Please configure credentials at /sitesettings');
  }
    
  try {
    const result = await unifi.unblockClient(reqBodyMac);
    if (typeof result === 'undefined' || result.length <= 0) {
      throw new Error(`Error blocking mac address: ${reqBodyMac}. ${JSON.stringify(result)}`);
    } else {
      console.log(`Successfully unblocked ${reqBodyMac}`);
    }
  } catch (error) {
    console.error(error);
  }
}
// Fix 14: blockSingle was missing — used in /devicegroups/:id/toggle
async function blockSingle(reqBodyMac) {
  if (!unifi) {
    throw new Error('UniFi controller not connected. Please configure credentials at /sitesettings');
  }
  try {
    const result = await unifi.blockClient(reqBodyMac);
    if (typeof result === 'undefined' || result.length <= 0) {
      throw new Error(`Error blocking mac address: ${reqBodyMac}. ${JSON.stringify(result)}`);
    } else {
      console.log(`Successfully blocked ${reqBodyMac}`);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
// Fix 8: MAC address validation helper
const MAC_REGEX = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;
function isValidMac(mac) {
  return typeof mac === 'string' && MAC_REGEX.test(mac);
}

// (async function() {
//     try {
//         const getMacAddress = await prisma.device.findMany();
//         const previousEzScheduleData = await prisma.easySchedule.findMany();

//         let matchingEZIds = [];
//         let newEZJobNames = [];
//         for (let i=0; i<previousEzScheduleData.length; i++) {
//             const matchedMacAddress = getMacAddress.find(
//                 (item) => item.id === previousEzScheduleData[i].deviceId
//             );
//             if (matchedMacAddress) {
//                 matchingEZIds.push({
//                     ...previousEzScheduleData[i],
//                     matchedMacAddress
//                 });
//             }
//         }
//         for (const data of matchingEZIds) {
//             const { date, hour, minute, ampm, oneTime, deviceId, blockAllow } = data;

//             console.log('data fetch checker\t', date, hour, minute, ampm, oneTime, deviceId, blockAllow);
//             // nodeOneTimeScheduleRule(data, unifi, prisma, jobFunction, schedule)
//             // let reInitiatedJob = schedule.scheduleJob(data.toggleSched, () => jobFunction(data.blockAllow, data.matchedMacAddress.macAddress, false, unifi, prisma));
//             // newEZJobNames.push({...data, jobName: reInitiatedJob.name})
//         }
//     } catch (error) {
//         console.error(error);
//     }
// })();

// (async function() {
//     // const path = '/v2/api/site/default/trafficrules';
//     const path = '/api/s/default/stat/sitedpi';
//     // const path = 'https://192.168.0.1/proxy/network/api/s/default/stat/sitedpi';
//     const timer = t => new Promise(res => setTimeout(res, t));
//     let result;
//     timer(2000)
//         .then(() => result = unifi?.customApiRequest(path, 'GET'))
//         .then(() => console.log(result))
// })();

// async function addEasySchedule(deviceId, dateTime, blockAllow, scheduleData, startNewJobTrue, prisma) {
//     const { month, day, minute, modifiedHour, ampm, date, oneTime, modifiedDaysOfTheWeek } = scheduleData;
//     const deviceToSchedule = await prisma.device.findUnique({ where: { id: deviceId } }); // deviceToSchedule.macAddress
//     try {
//         if (oneTime && startNewJobTrue) {
//             const addToDB = await prisma.easySchedule.create({ // create easySched
//                 data: {
//                     month: month,
//                     // days: day,
//                     minute: parseInt(minute),
//                     hour: modifiedHour,
//                     ampm: ampm,
//                     date: date,
//                     blockAllow: blockAllow,
//                     jobName: startNewJobTrue.name,
//                     toggleSched: true,
//                     oneTime: oneTime,
//                     device: {
//                         connect: { id: deviceToSchedule.id }
//                     },
//                 }
//             });
//         } else if (!oneTime && startNewJobTrue) {
//             const stringDays = convertDOWtoString(modifiedDaysOfTheWeek);
//             const addToDB = await prisma.easySchedule.create({ // create easySched
//                 data: {
//                     month: month,
//                     days: stringDays,
//                     minute: parseInt(minute),
//                     hour: modifiedHour,
//                     ampm: ampm,
//                     date: date,
//                     blockAllow: blockAllow,
//                     jobName: startNewJobTrue.name,
//                     toggleSched: true,
//                     oneTime: oneTime,
//                     device: {
//                         connect: { id: deviceToSchedule.id }
//                     },
//                 }
//             });
//         } else {
//             throw new Error("startNewJob false...");
//         }
//     } catch (error) {
//         console.error(error);
//     }
// }

// async function nodeOneTimeScheduleRule(data, unifi, prisma, jobFunction, schedule) {
//     const { date, hour, minute, ampm, modifiedDaysOfTheWeek, oneTime, deviceId, scheduletype } = data;
//     const deviceToSchedule = await prisma.device.findUnique({ where: { id: deviceId } });
//     const { year, month, day } = dateFromDateString(date);
//     const blockAllow = scheduletype;
//     const modifiedHour = convertToMilitaryTime(ampm, hour);

//     const scheduleData = {
//         year,
//         month,
//         day,
//         date,
//         minute,
//         ampm,
//         modifiedHour,
//         oneTime
//     };

//     const dateTime = new Date(year, month-1, day, modifiedHour, parseInt(minute), 0);
//     const startNewJobTrue = schedule.scheduleJob(dateTime, () => jobFunction(blockAllow, deviceToSchedule?.macAddress, oneTime, unifi, prisma));
//     addEasySchedule(deviceId, dateTime, scheduletype, scheduleData, startNewJobTrue, prisma); // -- do easy schedule in end point, not in function?
//     return startNewJobTrue;
// }

// async function nodeScheduleRecurrenceRule(data, unifi, prisma, jobFunction, schedule) {
//     const { date, hour, minute, ampm, modifiedDaysOfTheWeek, deviceId, oneTime, scheduletype } = data;
//     const deviceToSchedule = await prisma.device.findUnique({ where: { id: deviceId } });
//     const { year, month, day } = dateFromDateString(date);
//     const modifiedHour = convertToMilitaryTime(ampm, parseInt(hour));
//     const blockAllow = scheduletype;
//     const scheduleData = {
//         year,
//         month,
//         day,
//         date,
//         minute,
//         ampm,
//         modifiedHour,
//         modifiedDaysOfTheWeek,
//         oneTime
//     }
//     const rule = new schedule.RecurrenceRule();
//     const dateTime = new Date(year, month-1, day, modifiedHour, parseInt(minute), 0);
//     const daysOfTheWeek = modifiedDaysOfTheWeek;
//     rule.dayOfWeek = [...daysOfTheWeek];
//     rule.hour = hour;
//     rule.minute = minute;
//     const startNewJobTrue = schedule.scheduleJob(rule, () => jobFunction(blockAllow, deviceToSchedule?.macAddress, oneTime, unifi, prisma));
//     addEasySchedule(deviceId, dateTime, scheduletype, scheduleData, startNewJobTrue, prisma);
//     return startNewJobTrue;
// }

// Health check endpoint for Docker

// Database migration status endpoint for debugging

// Debug status endpoint

// Reinitialize connection after credentials change

// Manual UniFi connection endpoint for troubleshooting

// Create a UniFi speed-limit traffic rule (bandwidth cap on target clients).
// Body: { description, enabled, devices } — devices is the selected list with
// { id, name, macAddress }. The UniFi speed-limit payload is built here because
// this controller's traffic-rule schema has no CLIENT matching target: specific
// clients are targeted by their IP via matching_target = 'CLIENT' (the UniFi
// enum for this field only accepts ALL_CLIENTS/CLIENT/NETWORK), so we map each
// selected device's MAC to its current IP from the controller.

// Edit an existing traffic rule: update the UniFi controller rule plus its
// locally tracked description, action (block/allow) and target device set.
// Body:
//   { trafficRuleId, unifiRule, description, action,
//     targetDevices: [{ client_mac, type }], dbDevices: [{ id, name, macAddress }] }.

// =========================== Traffic rule schedules ===========================
// A traffic rule schedule enables (allow) or disables (block) the rule at a
// chosen time, mirroring the device EasySchedules system.

// ======== DEVICE GROUPS API ENDPOINTS ========

// Get all device groups

// Create new device group

// Update device group

// Delete device group

// Assign devices to group

// Block all devices in group

// Unblock all devices in group

// Assign rules to a device group (replaces the current rule set for the group)

// Create a new schedule for a device group

// Delete a schedule for a device group

// Toggle a schedule for a device group

// ---- Route modules: shared context + registration ----
// The mutable UniFi connection is exposed via getUnifi() so route handlers
// always read the live controller instance (re-authentication reassigns
// `unifi`). Everything else is passed by reference from module scope.
const ctx = {
  prisma,
  schedule,
  jobFunction,
  schedulerService,
  unifiRequest,
  withUnifiRetry,
  reAuthenticateUnifi,
  isUnauthorizedUnifiError,
  blockSingle,
  unblockSingle,
  blockMultiple,
  unBlockMultiple,
  getBlockedUsers,
  isValidMac,
  sendError,
  handleLoginError,
  isDiagnosticsEnabled,
  encrypt,
  decrypt,
  isEncryptionEnabled,
  generateAndSaveKey,
  fetchLoginInfo,
  logIntoUnifi,
  timeoutMap,
  startTimeout,
  endTimeout,
  startBonusTime,
  deleteBonusToggles,
  bonusRestartPausedJobs,
  clearBonusTimeExpiry,
  startBonusRule,
  endBonusRule,
  addTrafficRuleSchedule,
  toggleTrafficRuleSchedule,
  deleteTrafficRuleSchedule,
  stopBonusTime,
  minutesHoursToMilli,
  convertToMilitaryTime,
  dateFromDateString,
  consoleReader,
  serverLogger,
  logger,
  red,
  validateCron,
  cronBonusTimeEndJobReinitiation,
  easyBonusTimeEndJobReinitiation,
  appVersion,
  auth,
  rateLimit,
  getUnifi: () => unifi,
};

registerhealth(app, ctx);
registerdevices(app, ctx);
registerschedules(app, ctx);
registersettings(app, ctx);
registerdevicegroups(app, ctx);
registertrafficrules(app, ctx);

app.get('**', (req, res) => {
  // Never return index.html for missing static assets (e.g. a stale/missing
  // /assets/*.js chunk on a mobile browser). The browser would try to parse
  // HTML as a JS module and silently end up with a blank screen. Asset requests
  // get a real 404 so the failure is surfaced clearly instead.
  if (/\\.(?:js|css|json|map|png|jpe?g|gif|svg|webp|avif|otf|ttf|woff2?|ico)$/i.test(req.path)) {
    return res.status(404).end();
  }
  // Client-side routes (e.g. /trafficrules/, /manageapp/:cat/:id) fall back to
  // the SPA shell. Serve it uncached so browsers always pick up current assets.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(PROJECT_ROOT, 'dist', 'index.html'));
});

// ---- Global error-handling middleware ----
// Catches errors forwarded by asyncHandler (rejected promises in route
// handlers). Sends a 500 JSON response instead of leaving the request hanging.
app.use(async (err, req, res, next) => {
  console.error('Unhandled route error:', err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  let diag = false;
  try {
    diag = await isDiagnosticsEnabled(prisma);
  } catch (e) {
    diag = false;
  }
  res.status(500).json(diag
    ? { error: 'Internal server error.', details: err?.message }
    : { error: 'Internal server error.' });
});

const PORT = process.env.PORT || customPORT; // portSettings.js

// Restore bonus-time timers that survived a container restart.
// IMPORTANT: wait for init() to finish connecting (unifi set) BEFORE re-arming,
// otherwise the schedule/bonus jobs capture unifi = null and skip the UniFi PUT.
(async () => {
  try {
    await initPromise;
    const deviceResult = await reArmDeviceBonusOnBoot(unifi, prisma, jobFunction, schedulerService);
    console.log(`[boot] Device bonus timers re-armed: ${deviceResult.rearmed}, expired: ${deviceResult.expired}`);
    const ruleResult = await reArmTrafficBonusOnBoot(unifiRequest, prisma);
    console.log(`[boot] Traffic rule bonus timers re-armed: ${ruleResult.rearmed}, expired: ${ruleResult.expired}`);
    const schedResult = await reArmTrafficRuleSchedulesOnBoot(unifiRequest, prisma);
    console.log(`[boot] Traffic rule schedules re-armed: ${schedResult.rearmed}`);
  } catch (error) {
    console.error('[boot] Failed to restore bonus timers:', error);
  }
})();

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}....`);
});

process.on('SIGINT', function () {
  console.log('~SIGINT FIRED~');
  schedule.gracefulShutdown()
    .then(() => process.exit(0));
});

// Safety net: a rejected/errored scheduled job (e.g. node-schedule emits an
// unhandled 'error' when a callback rejects) must not take down the whole app.
// The job-level try/catch is the primary fix; this logs anything that slips
// through so the container keeps serving instead of exiting with code 1.
process.on('unhandledRejection', (reason) => {
  console.error('[global] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[global] Uncaught exception:', error);
});
