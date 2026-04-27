/**
 * OS scheduler integration.
 *
 * macOS  -> launchd LaunchAgent in ~/Library/LaunchAgents
 * Linux  -> prints a systemd-user unit (manual install — varies by distro)
 * Win    -> prints a `schtasks` command (manual install)
 *
 * launchd is the recommended path: it survives reboots, recovers missed
 * runs, captures logs, and doesn't require a foreground process. We don't
 * try to manage daemons ourselves.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import type { Frequency } from './config.js';
import { logDir } from './paths.js';

export interface InstallResult {
  installed: boolean;
  platform: NodeJS.Platform;
  /** Where the unit / plist / scheduled task lives */
  path?: string;
  /** Manual command the user needs to run (if installation isn't automated for this platform) */
  manualCommand?: string;
  message: string;
}

export function install(name: string, frequency: Frequency): InstallResult {
  if (frequency === 'manual') {
    return {
      installed: false,
      platform: platform(),
      message: 'Frequency is "manual"; nothing to install. Run `mediagraph sync run <name>` on your own schedule.',
    };
  }

  const cmd = resolveBinPath();
  switch (platform()) {
    case 'darwin':
      return installLaunchd(name, frequency, cmd);
    case 'linux':
      return suggestSystemd(name, frequency, cmd);
    case 'win32':
      return suggestSchtasks(name, frequency, cmd);
    default:
      return {
        installed: false,
        platform: platform(),
        message: `No automatic installer for platform ${platform()}. Schedule \`${cmd} sync run ${name}\` yourself.`,
      };
  }
}

export function uninstall(name: string): InstallResult {
  switch (platform()) {
    case 'darwin':
      return uninstallLaunchd(name);
    default:
      return {
        installed: false,
        platform: platform(),
        message: `Automatic uninstall not supported on ${platform()}; remove the schedule manually.`,
      };
  }
}

function resolveBinPath(): string {
  // process.argv[1] is the path to the running script. When installed via
  // npm, this resolves to the shim in node_modules/.bin/mediagraph (a symlink
  // to dist/index.js). launchd needs an absolute path.
  return process.argv[1];
}

function plistPath(name: string): string {
  return join(homedir(), 'Library', 'LaunchAgents', `io.mediagraph.sync.${name}.plist`);
}

function installLaunchd(name: string, frequency: Frequency, cmd: string): InstallResult {
  const path = plistPath(name);
  mkdirSync(logDir(name), { recursive: true });
  const stdoutLog = join(logDir(name), 'stdout.log');
  const stderrLog = join(logDir(name), 'stderr.log');
  const label = `io.mediagraph.sync.${name}`;
  const node = process.execPath;

  const schedule = launchdSchedule(frequency);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${cmd}</string>
    <string>sync</string>
    <string>run</string>
    <string>${name}</string>
  </array>
  ${schedule}
  <key>StandardOutPath</key><string>${stdoutLog}</string>
  <key>StandardErrorPath</key><string>${stderrLog}</string>
  <key>RunAtLoad</key><false/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>${homedir()}</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;
  writeFileSync(path, plist, { mode: 0o644 });

  // Best-effort load; if a previous version is loaded, unload first.
  try { execSync(`launchctl bootout gui/$(id -u) ${path}`, { stdio: 'ignore' }); } catch { /* ignore */ }
  try {
    execSync(`launchctl bootstrap gui/$(id -u) ${path}`, { stdio: 'ignore' });
  } catch (e) {
    return {
      installed: false,
      platform: 'darwin',
      path,
      message: `Wrote plist but failed to load with launchctl: ${(e as Error).message}. Run: launchctl bootstrap gui/$(id -u) ${path}`,
    };
  }

  return {
    installed: true,
    platform: 'darwin',
    path,
    message: `Installed launchd agent ${label}. Logs: ${stdoutLog} / ${stderrLog}.`,
  };
}

function uninstallLaunchd(name: string): InstallResult {
  const path = plistPath(name);
  if (!existsSync(path)) {
    return { installed: false, platform: 'darwin', message: `No launchd agent at ${path}.` };
  }
  try { execSync(`launchctl bootout gui/$(id -u) ${path}`, { stdio: 'ignore' }); } catch { /* ignore */ }
  rmSync(path, { force: true });
  return { installed: false, platform: 'darwin', path, message: `Removed launchd agent for "${name}".` };
}

function launchdSchedule(frequency: Frequency): string {
  switch (frequency) {
    case 'every-15-min':
      return '<key>StartInterval</key><integer>900</integer>';
    case 'hourly':
      return '<key>StartInterval</key><integer>3600</integer>';
    case 'nightly':
      return [
        '<key>StartCalendarInterval</key>',
        '<dict>',
        '  <key>Hour</key><integer>2</integer>',
        '  <key>Minute</key><integer>0</integer>',
        '</dict>',
      ].join('\n  ');
    default:
      return '<key>StartInterval</key><integer>3600</integer>';
  }
}

function suggestSystemd(name: string, frequency: Frequency, cmd: string): InstallResult {
  const onCalendar = frequency === 'nightly' ? '*-*-* 02:00:00' : frequency === 'hourly' ? 'hourly' : '*:0/15';
  const unit = `# ~/.config/systemd/user/mediagraph-sync-${name}.service
[Unit]
Description=Mediagraph sync (${name})

[Service]
Type=oneshot
ExecStart=${process.execPath} ${cmd} sync run ${name}

# ~/.config/systemd/user/mediagraph-sync-${name}.timer
[Unit]
Description=Mediagraph sync timer (${name})

[Timer]
OnCalendar=${onCalendar}
Persistent=true

[Install]
WantedBy=timers.target

# Then:  systemctl --user daemon-reload && systemctl --user enable --now mediagraph-sync-${name}.timer
`;
  return {
    installed: false,
    platform: 'linux',
    manualCommand: unit,
    message: 'Linux: write the systemd-user unit/timer below, then daemon-reload + enable. (Automatic install not implemented.)',
  };
}

function suggestSchtasks(name: string, frequency: Frequency, cmd: string): InstallResult {
  const sc = frequency === 'nightly' ? 'DAILY' : frequency === 'hourly' ? 'HOURLY' : 'MINUTE';
  const mod = frequency === 'every-15-min' ? '/MO 15' : '';
  const command = `schtasks /Create /SC ${sc} ${mod} /TN "MediagraphSync-${name}" /TR "${process.execPath} ${cmd} sync run ${name}"`;
  return {
    installed: false,
    platform: 'win32',
    manualCommand: command,
    message: 'Windows: run the command below as your user. (Automatic install not implemented.)',
  };
}
