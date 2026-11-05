/// <reference types="node" />
/** Run with `bun test plugins/withVoiceLiveActivity.test.ts` from apps/mobile/app. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

const xcode = require('xcode') as { project(file: string): XcodeProject };
const { addWidgetTarget, findWidgetTarget, widgetInfoPlist, TARGET } = require('./withVoiceLiveActivity.js') as {
  addWidgetTarget(
    project: XcodeProject,
    options: { appName: string; bundleIdentifier: string; appleTeamId?: string },
  ): boolean;
  findWidgetTarget(project: XcodeProject): any;
  widgetInfoPlist(version: string, buildNumber: string): string;
  TARGET: string;
};

type Objects = Record<string, Record<string, any>>;
type XcodeProject = {
  parseSync(): XcodeProject;
  writeSync(): string;
  hash: { project: { objects: Objects } };
  getFirstTarget(): { uuid: string; firstTarget: any };
};

/** Expo's own bare template (the project `expo prebuild` starts from), parsed fresh. */
function templateProject(): { project: XcodeProject; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-live-activity-'));
  const tarball = path.join(__dirname, '..', 'node_modules', 'expo', 'template.tgz');
  execFileSync('tar', ['-xzf', tarball, '-C', root, 'package/ios/HelloWorld.xcodeproj/project.pbxproj']);
  const file = path.join(root, 'package/ios/HelloWorld.xcodeproj/project.pbxproj');
  return { project: xcode.project(file).parseSync(), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function entries(objects: Objects, isa: string): [string, Record<string, any>][] {
  return Object.entries(objects[isa] ?? {}).filter(
    ([key, value]) => !key.endsWith('_comment') && typeof value === 'object',
  );
}

function buildFileNames(objects: Objects, phase: Record<string, any>): string[] {
  return phase.files.map((file: { value: string }) => {
    const reference = objects.PBXFileReference[objects.PBXBuildFile[file.value].fileRef];
    return String(reference.name ?? reference.path).replace(/"/g, '');
  });
}

describe('withVoiceLiveActivity', () => {
  test('adds the Live Activity extension, embedded in the app, with the intent in both targets', () => {
    const { project, cleanup } = templateProject();
    try {
      assert.equal(
        addWidgetTarget(project, {
          appName: 'HelloWorld',
          bundleIdentifier: 'com.example.app',
          appleTeamId: 'TEAM123',
        }),
        true,
      );
      const objects = project.hash.project.objects;
      const target = findWidgetTarget(project);
      const targetUuid = Object.keys(objects.PBXNativeTarget).find((key) => objects.PBXNativeTarget[key] === target);
      assert.ok(target, 'the extension target exists');
      assert.equal(target.productType, '"com.apple.product-type.app-extension"');

      const product = objects.PBXFileReference[target.productReference];
      assert.equal(product.path, `"${TARGET}.appex"`);

      const phases = target.buildPhases.map((phase: { value: string }) => phase.value);
      const sources = entries(objects, 'PBXSourcesBuildPhase').find(([key]) => phases.includes(key))?.[1];
      assert.deepEqual(buildFileNames(objects, sources!).sort(), [
        'GhostexVoiceActivityAttributes.swift',
        'GhostexVoiceActivityWidget.swift',
        'GhostexVoiceTalkIntent.swift',
      ]);

      const app = project.getFirstTarget().firstTarget;
      const appPhases = app.buildPhases.map((phase: { value: string }) => phase.value);
      const embed = entries(objects, 'PBXCopyFilesBuildPhase').find(([key]) => appPhases.includes(key))?.[1];
      assert.equal(String(embed!.dstSubfolderSpec), '13', 'embedded in PlugIns');
      assert.deepEqual(buildFileNames(objects, embed!), [`${TARGET}.appex`]);
      const appSources = entries(objects, 'PBXSourcesBuildPhase').find(([key]) => appPhases.includes(key))?.[1];
      assert.ok(
        buildFileNames(objects, appSources!).includes('GhostexVoiceTalkIntentApp.swift'),
        'the app compiles the intent too',
      );
      assert.ok(
        app.dependencies.some(
          (dependency: { value: string }) => objects.PBXTargetDependency[dependency.value].target === targetUuid,
        ),
        'the app builds the extension first',
      );

      const list = objects.XCConfigurationList[target.buildConfigurationList];
      for (const ref of list.buildConfigurations) {
        const settings = objects.XCBuildConfiguration[ref.value].buildSettings;
        assert.equal(settings.PRODUCT_BUNDLE_IDENTIFIER, '"com.example.app.VoiceActivity"');
        assert.equal(settings.DEVELOPMENT_TEAM, 'TEAM123');
        assert.equal(settings.INFOPLIST_FILE, `${TARGET}/Info.plist`);
        assert.equal(settings.CODE_SIGN_STYLE, 'Automatic');
      }

      const written = project.writeSync();
      const ours = written
        .split('\n')
        .filter((line) => /GhostexVoice/.test(line) && /isa = PBXFileReference/.test(line));
      assert.ok(ours.length >= 5);
      for (const line of ours) assert.ok(!line.includes('undefined'), `no "undefined" in ${line}`);

      // `expo prebuild` runs plugins over a fresh project each time, but a second run must not add a twin.
      assert.equal(addWidgetTarget(project, { appName: 'HelloWorld', bundleIdentifier: 'com.example.app' }), false);
      assert.equal(
        entries(objects, 'PBXNativeTarget').filter(([, value]) => value.name === `"${TARGET}"` || value.name === TARGET)
          .length,
        1,
      );
    } finally {
      cleanup();
    }
  });

  test("gives the extension the app's version and build number", () => {
    const plist = widgetInfoPlist('10.47.0', '104700');
    assert.match(plist, /<key>CFBundleShortVersionString<\/key><string>10\.47\.0<\/string>/);
    assert.match(plist, /<key>CFBundleVersion<\/key><string>104700<\/string>/);
    assert.match(plist, /<string>com\.apple\.widgetkit-extension<\/string>/);
  });
});
