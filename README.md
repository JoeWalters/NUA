![NUA Logo](nua-logo.webp)

NUA is a NodeJS-based web application designed to simplify device management on UniFi networks. This intuitive tool offers an easy-to-use web interface, empowering you to effortlessly block and unblock devices within your UniFi network.

This software only works with [UniFi Cloud Gateways](https://ui.com/us/en/cloud-gateways).

## Features
* ✨ **Intuitive Web Interface**: Enjoy a simple and easy-to-use web interface that streamlines the device management process.
* 🔒 **Device Blocking**: Take control of your network by blocking specific devices, ensuring a distraction-free environment or enforcing necessary restrictions.
* 🔒 **App Blocking**: Block specific apps and websites.
* 🚦 **Traffic Rules**: Create, edit, and import UniFi traffic rules (block/allow apps, categories, and domains) directly from the web UI, with the rules mirrored in the local database.
* ⚡ **Speed Limits**: Set per-device download/upload bandwidth caps via UniFi speed-limit traffic rules — ideal for throttling bandwidth-heavy devices like consoles or streaming boxes.
* ⌚ **Cron Scheduler**: Leverage the built-in cron scheduler to automate device management tasks. Schedule device blocking for specific time slots, creating a structured environment.
* 👨‍👩‍👧‍👦 **Parental Controls**: Use NUA as a robust parental control tool. Set device time limits or enforce restrictions until chores are completed, promoting a healthy balance of technology usage.

## Screenshot

|                                       |                                       |
|:-------------------------------------:|:-------------------------------------:|
| <img src="images/image01.webp" width="500"> |<img src="images/image02.webp" width="500">|
| <img src="images/image03.webp" width="500"> |<img src="images/image04.webp" width="500">|


![Usage](images/Usage.gif)

#

## Install & Configure

### Docker (recommended)

The recommended way to run NUA is with Docker. The CI workflow builds and
pushes the image to Docker Hub; you can pull a published image or build it
locally.

1. Build the image locally (or pull a published image):

```bash
docker build -t nua .
```

2. Run the container with the required environment variables:

```bash
docker run -d --name nua -p 4323:4323 \
  -e HOSTNAME="your-unifi-controller-hostname" \
  -e PORT=4323 \
  -e CREDENTIAL_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  nua
```

3. Verify the app is healthy:

```bash
curl http://localhost:4323/health
# -> {"status":"healthy","database":"connected",...}
```

Docker handles restarts and autostart automatically (use `--restart unless-stopped`
if you want the container to come back after a reboot). Set any other environment
variables with `-e` (see [Environment variables](#environment-variables) below).
The full list of supported variables is in `.env.template`.

### Manual install (alternative)

If you prefer to run NUA without Docker, install Node.js 18+ and follow the steps
below.

1. Install Node.js 18+ (for example with NVM):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
source ~/.bashrc
nvm install v18.18.1
node -v
```

2. Install Git and clone the repository:
```bash
sudo apt -y install git
git clone git@github.com:JoeWalters/NUA.git
cd NUA
```

3. Install the frontend dependencies:
```bash
npm install
```

4. Install the server dependencies:
```bash
cd server
npm install
```

5. Initiate the Prisma database:
```bash
npm run db
```

6. Build the frontend:
```bash
cd ..
npm run build
```

7. Configure the port (optional). The default is 4323; change it in
`server/globalSettings.js`:

```js
const customPORT = 5000;

module.exports = customPORT;
```

## Optional - Enable authentication

By default NUA has **no authentication** and should only be used on a trusted local network (see the Warning section below). If you want to require a login before anyone can use the web UI or API, set these environment variables before starting the server:

```bash
NUA_AUTH_ENABLED=true
NUA_AUTH_USERNAME=your-username
NUA_AUTH_PASSWORD=your-password
```

- Setting `NUA_AUTH_USERNAME` and `NUA_AUTH_PASSWORD` alone also enables auth (the `NUA_AUTH_ENABLED` flag is then implied).
- Sessions last 8 hours by default; override with `NUA_AUTH_SESSION_TTL_MS` (milliseconds).
- When enabled, the web UI shows a login screen, and all API routes are protected except `/login`, `/logout`, `/auth-status`, `/health` and the static assets (so the login page can always be loaded).
- A "Log out" button appears in the navbar.

These variables can be set in your shell, in a `.env` file, or in the Docker run command. See `.env.template` for the full list.

## Environment variables

| Variable | Description |
|----------|-------------|
| `HOSTNAME` | The hostname of your UniFi controller (required to connect). |
| `PORT` | The port NUA listens on (default `4323`). |
| `CREDENTIAL_ENCRYPTION_KEY` | Secret key used to encrypt stored UniFi credentials. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it stable between restarts. |
| `NUA_AUTH_ENABLED` | `true` to require a login (default `false`). |
| `NUA_AUTH_USERNAME` | Login username (when auth is enabled). |
| `NUA_AUTH_PASSWORD` | Login password (when auth is enabled). |
| `NUA_AUTH_SESSION_TTL_MS` | Session lifetime in ms (default `28800000` = 8 hours). |
| `NODE_ENV` | Set in the Docker image (`development`); leave as-is. |
| `AUTO_MIGRATE` | Set in the Docker image (`true`); leave as-is. |
| `PRISMA_CLI_QUERY_ENGINE_TYPE` | Set in the Docker image (`binary`); leave as-is. |

> **Note:** When running locally, set `HOSTNAME`, `PORT`, and `CREDENTIAL_ENCRYPTION_KEY` (plus the optional `NUA_AUTH_*` variables). The Docker image sets `NODE_ENV`, `AUTO_MIGRATE`, and `PRISMA_CLI_QUERY_ENGINE_TYPE` automatically.

## Start NUA Software

With Docker, the container starts when you run `docker run` (or starts automatically with `--restart`). With a manual install, start the server like so:

1. Navigate to the `server` directory:
```bash
cd server
```

2. Run the following command to start NUA:
```bash
npm run start
```
This will initiate the NUA software. Make sure to check the console for any logs or messages to ensure that NUA has started successfully.

## How do I run this in the background/autostart?

With Docker, use `--restart unless-stopped` (or `--restart always`) so the
container restarts automatically after a reboot or crash — no extra tooling needed.

If you run NUA manually (without Docker), you can use a process manager like
[pm2](https://pm2.keymetrics.io/docs/usage/quick-start/) to keep it running in
the background.

## Wiki
[Check the Wiki](https://github.com/ArtimusMaximus/NUA/wiki)

# Support
If you encounter issues with NUA, follow these steps before reporting a bug:
* Update to the latest version of NUA.
* Turn the device off and on again.
* Use the search function to check if this issue has already been reported or resolved.
* [Check the Wiki](https://github.com/ArtimusMaximus/NUA/wiki)

Following these steps can help address common problems and ensure that you are using the latest version of NUA. If the issue persists, consider reporting it to the appropriate channels.

# Feature Requests
1. **Check the Issues Tracker**:

    Before submitting a new feature request, check the issues tracker to see if someone else has already requested a similar feature.

2. **Thumbs Up for Similar Ideas**:

    If you find a similar feature request, give it a thumbs up to show your support. Avoid adding comments like +1, as it can create unnecessary spam.

By adhering to these guidelines, you contribute to a more organized and streamlined feature request process. Your input is valuable in shaping the future development of the software.

# Warning
This software comes with the following warnings:

1. Not for production use:

    This software should not be used in a production environment. It may not have undergone sufficient testing or validation for reliable production use.

2.  This app should not be directly accessible from the internet :

    Ensure that this software is not accessible from the internet. Exposing it to the internet may pose security risks. Limit its usage to controlled and secure environments.

3. Use at your own risk:

    The use of this software is at your own risk. The developers do not guarantee its performance, security, or suitability for any specific purpose. Exercise caution and consider potential risks before deploying or using this software.

# License
This software is released under the GNU Lesser General Public License version 3 (LGPL v3), an open-source license. You are free to use, modify, and distribute the software as you see fit. However, any modifications you make to the software must also be open-sourced under the same LGPL v3 license.

For more details about the LGPL v3 license, please refer to the [GNU Lesser General Public License version 3](https://www.gnu.org/licenses/lgpl-3.0.en.html).
