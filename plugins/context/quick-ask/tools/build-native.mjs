import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 仅在显式执行此脚本（由主插件的 build:native 命令调用）时构建，不启动 helper。
if (process.platform !== 'darwin') {
  console.log(JSON.stringify({ type: 'native-build', status: 'skipped', reason: '仅支持 macOS' }));
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const native = join(root, 'native');
const source = join(native, 'QuickAskHelper.swift');
const destination = join(native, 'QuickAskHelper.app');
const bundleID = 'com.local.dsh.quickask.helper';
const machine = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : null;
if (!machine) throw new Error(`不支持的 macOS 架构：${process.arch}`);
if (!existsSync(source)) throw new Error('缺少 native/QuickAskHelper.swift');
if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) {
  throw new Error('拒绝覆盖符号链接形式的 helper 应用');
}

function run(program, args) {
  return execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim();
}

const sdk = run('xcrun', ['--show-sdk-path']);
const temporary = mkdtempSync(join(native, '.quickask-build-'));
const staged = join(temporary, 'QuickAskHelper.app');
const contents = join(staged, 'Contents');
const executable = join(contents, 'MacOS', 'QuickAskHelper');
const previous = join(temporary, 'previous.app');
let movedPrevious = false;
let installed = false;

try {
  mkdirSync(dirname(executable), { recursive: true });
  const architectures = [];
  const binaries = [];
  for (const arch of [machine, machine === 'arm64' ? 'x86_64' : 'arm64']) {
    const output = join(temporary, `QuickAskHelper-${arch}`);
    try {
      run('xcrun', ['swiftc', '-swift-version', '5', '-O', '-target', `${arch}-apple-macosx13.0`,
        '-sdk', sdk, '-module-cache-path', join(native, '.swift-module-cache', `module-cache-${arch}`),
        '-framework', 'AppKit', '-framework', 'ApplicationServices', '-framework', 'Carbon',
        source, '-o', output]);
      architectures.push(arch);
      binaries.push(output);
    } catch (error) {
      if (arch === machine) throw error;
      console.error(JSON.stringify({ type: 'native-build', status: 'warning', architecture: arch,
        message: '交叉编译失败，仅输出本机架构', detail: String(error.stderr || error.message) }));
    }
  }
  run('xcrun', ['lipo', '-create', ...binaries, '-output', executable]);
  writeFileSync(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>${bundleID}</string>
  <key>CFBundleExecutable</key><string>QuickAskHelper</string>
  <key>CFBundleName</key><string>QuickAskHelper</string>
  <key>CFBundleDisplayName</key><string>随手问辅助程序</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`, 'utf8');
  run('/usr/bin/plutil', ['-lint', join(contents, 'Info.plist')]);
  run('/usr/bin/codesign', ['--force', '--sign', '-', '--identifier', bundleID, '--timestamp=none', staged]);
  run('/usr/bin/codesign', ['--verify', '--strict', staged]);
  if (existsSync(destination)) {
    renameSync(destination, previous);
    movedPrevious = true;
  }
  renameSync(staged, destination);
  installed = true;
  console.log(JSON.stringify({ type: 'native-build', status: 'built', architectures,
    minimumMacOS: '13.0', bundleID, signing: 'ad-hoc',
    app: destination, executable: join(destination, 'Contents', 'MacOS', 'QuickAskHelper') }));
} catch (error) {
  if (movedPrevious && !installed && !existsSync(destination)) renameSync(previous, destination);
  console.error(JSON.stringify({ type: 'native-build', status: 'failed',
    detail: String(error.stderr || error.message) }));
  process.exitCode = 1;
} finally {
  // 保留可复用的 Swift 模块缓存；清理受保护时报告残留，不绕过保护。
  try {
    rmSync(temporary, { recursive: true, force: true });
  } catch {
    console.error(JSON.stringify({ type: 'native-build', status: 'warning',
      message: '临时构建目录未清理，保留待手动处理', directory: temporary }));
  }
}
