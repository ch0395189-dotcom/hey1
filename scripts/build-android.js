#!/usr/bin/env node
/**
 * One-shot Android APK builder.
 * Runs: npm run build → npx cap sync android → gradlew assembleDebug
 * Outputs the path to the generated APK.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { platform } from 'node:os';

const cwd = process.cwd();
const isWindows = platform() === 'win32';

function run(command, args = [], options = {}) {
  return new Promise((resolvePromise, reject) => {
    const cmd = isWindows ? `${command}.cmd` : command;
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: isWindows,
      ...options,
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command "${command} ${args.join(' ')}" exited with code ${code}`));
      } else {
        resolvePromise();
      }
    });
  });
}

async function main() {
  console.log('\n🔨 HeyHey Android APK builder\n');

  // 1. Build the web app
  console.log('➡️  Step 1/3: npm run build');
  await run('npm', ['run', 'build']);

  // 2. Sync Capacitor assets to the Android project
  console.log('\n➡️  Step 2/3: npx cap sync android');
  await run('npx', ['cap', 'sync', 'android']);

  // 3. Build the debug APK with Gradle
  console.log('\n➡️  Step 3/3: Building APK with Gradle');
  const gradlew = isWindows ? 'android\\gradlew.bat' : 'android/gradlew';
  const gradlewPath = resolve(cwd, gradlew);

  if (!existsSync(gradlewPath)) {
    throw new Error(
      `Gradle wrapper not found at ${gradlewPath}.\n` +
      'Run "npx cap add android" first to create the Android project.'
    );
  }

  await run(gradlewPath, ['assembleDebug'], { cwd: resolve(cwd, 'android') });

  // Report the output path
  const debugOutputDir = resolve(cwd, 'android', 'app', 'build', 'outputs', 'apk', 'debug');
  const generatedApk = readdirSync(debugOutputDir).find((file) => file.startsWith('hey-hey-') && file.endsWith('.apk'));
  const apkPath = resolve(debugOutputDir, generatedApk || 'hey-hey.apk');

  console.log('\n✅ APK generated successfully!');
  console.log(`📱 Install it on your device:`);
  console.log(`   ${apkPath}\n`);
}

main().catch((err) => {
  console.error('\n❌ Build failed:\n', err.message || err);
  process.exit(1);
});
