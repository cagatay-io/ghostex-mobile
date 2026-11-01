/// <reference types="node" />
/**
 * Run with `bun test src/notifications/widgetsPlugin.test.ts`. The widget extension in the generated iOS project: the
 * real `plugins/withWidgets.js` through Expo's real Xcode project mod, on a project file read and written by the
 * `xcode` package prebuild uses. `expo prebuild` without `--clean` runs the plugin again on the project an earlier
 * prebuild wrote, so an extension target that an earlier version of the plugin created (the Live Activity's sources
 * under their own root, no App Group) has to end up as a new one: the sources and resources the plugin lists, its
 * entitlements and App Group, and the target, its bundle id and its embedding kept.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';

import { IOSConfig, type ExportedConfig, type XcodeProject } from 'expo/config-plugins';

import withWidgets from '../../plugins/withWidgets';

const TARGET = 'GhostexLiveActivityExtension';
const SOURCE_ROOT = '../modules';
const SOURCES = [
  'ghostex-live-activity/ios/Shared/GhostexActivityAttributes.swift',
  'ghostex-live-activity/ios/Extension/GhostexLiveActivityWidget.swift',
  'ghostex-live-activity/ios/Extension/GhostexActivityViews.swift',
  'ghostex-live-activity/ios/Extension/GhostexAgentMarks.swift',
  'ghostex-widgets/ios/Shared/GhostexWidgetStore.swift',
  'ghostex-widgets/ios/Extension/GhostexWidgetSnapshot.swift',
  'ghostex-widgets/ios/Extension/GhostexStatusWidget.swift',
  'ghostex-widgets/ios/Extension/GhostexStatusViews.swift',
];
const RESOURCES = ['ghostex-live-activity/ios/Extension/Assets.xcassets'];
const APP_BUNDLE_ID = 'com.example.ghostex';
const APP_GROUP = 'group.com.example.ghostex';
const TEAM = 'TEAM123456';
const APP_CONFIG = {
  name: 'Ghostex',
  slug: 'ghostex',
  version: '1.2.3',
  ios: {
    bundleIdentifier: APP_BUNDLE_ID,
    buildNumber: '7',
    appleTeamId: TEAM,
    entitlements: { 'com.apple.security.application-groups': [APP_GROUP] },
  },
};

/** An app's project before the plugin: the app target alone, deployment target 16.4 at the project level. */
const APP_PROJECT = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 54;
	objects = {

/* Begin PBXBuildFile section */
		13B07FBC1A68108700A75B9A /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 13B07FB01A68108700A75B9A /* AppDelegate.swift */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		13B07F961A680F5B00A75B9A /* Ghostex.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Ghostex.app; sourceTree = BUILT_PRODUCTS_DIR; };
		13B07FB01A68108700A75B9A /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = AppDelegate.swift; path = Ghostex/AppDelegate.swift; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
		83CBB9F61A601CBA00E9B192 = {
			isa = PBXGroup;
			children = (
				13B07FB01A68108700A75B9A /* AppDelegate.swift */,
				83CBBA001A601CBA00E9B192 /* Products */,
			);
			sourceTree = "<group>";
		};
		83CBBA001A601CBA00E9B192 /* Products */ = {
			isa = PBXGroup;
			children = (
				13B07F961A680F5B00A75B9A /* Ghostex.app */,
			);
			name = Products;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		13B07F861A680F5B00A75B9A /* Ghostex */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 13B07F931A680F5B00A75B9A /* Build configuration list for PBXNativeTarget "Ghostex" */;
			buildPhases = (
				13B07F871A680F5B00A75B9A /* Sources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = Ghostex;
			productName = Ghostex;
			productReference = 13B07F961A680F5B00A75B9A /* Ghostex.app */;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		83CBB9F71A601CBA00E9B192 /* Project object */ = {
			isa = PBXProject;
			buildConfigurationList = 83CBB9FA1A601CBA00E9B192 /* Build configuration list for PBXProject "Ghostex" */;
			compatibilityVersion = "Xcode 12.0";
			mainGroup = 83CBB9F61A601CBA00E9B192;
			productRefGroup = 83CBBA001A601CBA00E9B192 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				13B07F861A680F5B00A75B9A /* Ghostex */,
			);
		};
/* End PBXProject section */

/* Begin PBXSourcesBuildPhase section */
		13B07F871A680F5B00A75B9A /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				13B07FBC1A68108700A75B9A /* AppDelegate.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		13B07F941A680F5B00A75B9A /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				PRODUCT_BUNDLE_IDENTIFIER = ${APP_BUNDLE_ID};
				PRODUCT_NAME = Ghostex;
			};
			name = Debug;
		};
		13B07F951A680F5B00A75B9A /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				PRODUCT_BUNDLE_IDENTIFIER = ${APP_BUNDLE_ID};
				PRODUCT_NAME = Ghostex;
			};
			name = Release;
		};
		83CBBA201A601CBA00E9B192 /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				IPHONEOS_DEPLOYMENT_TARGET = 16.4;
				SDKROOT = iphoneos;
			};
			name = Debug;
		};
		83CBBA211A601CBA00E9B192 /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				IPHONEOS_DEPLOYMENT_TARGET = 16.4;
				SDKROOT = iphoneos;
			};
			name = Release;
		};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		13B07F931A680F5B00A75B9A /* Build configuration list for PBXNativeTarget "Ghostex" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				13B07F941A680F5B00A75B9A /* Debug */,
				13B07F951A680F5B00A75B9A /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
		83CBB9FA1A601CBA00E9B192 /* Build configuration list for PBXProject "Ghostex" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				83CBBA201A601CBA00E9B192 /* Debug */,
				83CBBA211A601CBA00E9B192 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
/* End XCConfigurationList section */
	};
	rootObject = 83CBB9F71A601CBA00E9B192 /* Project object */;
}
`;

const root = mkdtempSync(join(tmpdir(), 'ghostex-widgets-plugin-'));
after(() => rmSync(root, { recursive: true, force: true }));
const projectFile = join(root, 'ios/Ghostex.xcodeproj/project.pbxproj');

/** Writes `text` as the project file and reads it as prebuild does. */
function readProject(text: string): XcodeProject {
  mkdirSync(dirname(projectFile), { recursive: true });
  writeFileSync(projectFile, text);
  return IOSConfig.XcodeUtils.getPbxproj(root);
}

/** One prebuild's Xcode project mod on `project`; the result as the next prebuild reads it from the written file. */
async function prebuild(project: XcodeProject): Promise<XcodeProject> {
  const config: ExportedConfig = withWidgets(structuredClone(APP_CONFIG));
  const xcodeproj = config.mods?.ios?.xcodeproj;
  assert.ok(xcodeproj, 'the plugin adds no Xcode project mod');
  await xcodeproj({
    ...config,
    modResults: project,
    modRawConfig: structuredClone(APP_CONFIG),
    modRequest: {
      platform: 'ios',
      modName: 'xcodeproj',
      projectRoot: root,
      platformProjectRoot: join(root, 'ios'),
      introspect: false,
    },
  });
  return readProject(project.writeSync());
}

const unquote = (value: unknown) => String(value).replace(/^"(.*)"$/, '$1');

/** The uuids of a section's objects named `name`; the `xcode` package writes a new target's name quoted, Xcode not. */
function uuidsNamed(project: XcodeProject, section: string, name: string): string[] {
  const objects = project.hash.project.objects[section] ?? {};
  return Object.keys(objects).filter((key) => !key.endsWith('_comment') && unquote(objects[key].name) === name);
}

/** The paths of the file references in `entries` (group children or build files of a phase). */
function paths(project: XcodeProject, entries: Array<{ value: string }>, viaBuildFile: boolean): string[] {
  const { PBXBuildFile, PBXFileReference } = project.hash.project.objects;
  return entries.map(({ value }) => unquote(PBXFileReference[viaBuildFile ? PBXBuildFile[value].fileRef : value].path));
}

/** The extension as a maintainer would check it in Xcode. */
function extensionOf(project: XcodeProject) {
  const objects = project.hash.project.objects;
  const [targetUuid, ...otherTargets] = uuidsNamed(project, 'PBXNativeTarget', TARGET);
  assert.ok(targetUuid !== undefined, 'no extension target');
  assert.deepEqual(otherTargets, [], 'a second extension target');
  const [groupUuid, ...otherGroups] = uuidsNamed(project, 'PBXGroup', TARGET);
  assert.ok(groupUuid !== undefined, 'no extension group');
  assert.deepEqual(otherGroups, [], 'a second extension group');
  const target = objects.PBXNativeTarget[targetUuid];
  const phase = (name: string, type: string) => {
    const entries = target.buildPhases.filter((entry: { comment: string }) => entry.comment === name);
    assert.equal(entries.length, 1, `${name} phases`);
    return paths(project, objects[type][entries[0].value].files, true);
  };
  const mainGroup = objects.PBXGroup[project.getFirstProject().firstProject.mainGroup];
  return {
    targetUuid,
    groupInMainGroup: mainGroup.children.some((child: { value: string }) => child.value === groupUuid),
    groupPath: unquote(objects.PBXGroup[groupUuid].path),
    groupFiles: paths(project, objects.PBXGroup[groupUuid].children, false),
    sources: phase('Sources', 'PBXSourcesBuildPhase'),
    resources: phase('Resources', 'PBXResourcesBuildPhase'),
    frameworks: phase('Frameworks', 'PBXFrameworksBuildPhase'),
    settings: objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations.map(
      ({ value }: { value: string }) =>
        Object.fromEntries(
          Object.entries(objects.XCBuildConfiguration[value].buildSettings).map(([key, setting]) => [
            key,
            unquote(setting),
          ]),
        ),
    ),
  };
}

/** Every build file names an existing file reference, and every file reference of a source is the current one. */
function assertNoStaleReferences(project: XcodeProject) {
  const { PBXBuildFile, PBXFileReference } = project.hash.project.objects;
  for (const [key, file] of Object.entries<{ fileRef: string }>(PBXBuildFile)) {
    if (!key.endsWith('_comment')) assert.ok(PBXFileReference[file.fileRef], `build file ${key} names no reference`);
  }
  const swiftFiles = Object.entries<{ path?: string }>(PBXFileReference)
    .filter(([key, file]) => !key.endsWith('_comment') && unquote(file.path).endsWith('.swift'))
    .map(([, file]) => unquote(file.path));
  assert.deepEqual(swiftFiles.sort(), ['Ghostex/AppDelegate.swift', ...SOURCES].sort());
}

function assertCurrentExtension(project: XcodeProject) {
  const extension = extensionOf(project);
  assert.ok(extension.groupInMainGroup);
  assert.equal(extension.groupPath, SOURCE_ROOT);
  assert.deepEqual(extension.groupFiles, [...SOURCES, ...RESOURCES]);
  assert.deepEqual(extension.sources, SOURCES);
  assert.deepEqual(extension.resources, RESOURCES);
  assert.deepEqual(extension.frameworks, []);
  assert.equal(extension.settings.length, 2);
  for (const settings of extension.settings) {
    assert.equal(settings.PRODUCT_BUNDLE_IDENTIFIER, `${APP_BUNDLE_ID}.liveactivity`);
    assert.equal(settings.INFOPLIST_FILE, `${TARGET}/Info.plist`);
    assert.equal(settings.CODE_SIGN_ENTITLEMENTS, `${TARGET}/${TARGET}.entitlements`);
    assert.equal(settings.GHOSTEX_APP_GROUP, APP_GROUP);
    assert.equal(settings.DEVELOPMENT_TEAM, TEAM);
    assert.equal(settings.IPHONEOS_DEPLOYMENT_TARGET, '16.4');
    assert.equal(settings.APPLICATION_EXTENSION_API_ONLY, 'YES');
  }
  assertNoStaleReferences(project);
  return extension;
}

/** The extension as the previous version of the plugin created it: the Live Activity alone, without App Group. */
function withPreviousExtension(project: XcodeProject): string {
  const oldRoot = '../modules/ghostex-live-activity/ios';
  const oldSources = [
    'Shared/GhostexActivityAttributes.swift',
    'Extension/GhostexLiveActivityWidget.swift',
    'Extension/GhostexActivityViews.swift',
    'Extension/GhostexAgentMarks.swift',
  ];
  const oldResources = ['Extension/Assets.xcassets'];
  const objects = project.hash.project.objects;
  objects.PBXTargetDependency = objects.PBXTargetDependency ?? {};
  objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {};
  const group = project.addPbxGroup([...oldSources, ...oldResources], TARGET, oldRoot);
  project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
  const target = project.addTarget(TARGET, 'app_extension', TARGET, `${APP_BUNDLE_ID}.liveactivity`);
  project.addBuildPhase(oldSources, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
  project.addBuildPhase(oldResources, 'PBXResourcesBuildPhase', 'Resources', target.uuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
  for (const entry of objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList].buildConfigurations) {
    Object.assign(objects.XCBuildConfiguration[entry.value].buildSettings, {
      INFOPLIST_FILE: `"${TARGET}/Info.plist"`,
      GENERATE_INFOPLIST_FILE: 'NO',
      APPLICATION_EXTENSION_API_ONLY: 'YES',
    });
  }
  return target.uuid;
}

describe('the widget extension in the generated project', () => {
  test('a new project gets the extension with every listed source, resource and setting', async () => {
    const project = await prebuild(readProject(APP_PROJECT));
    assertCurrentExtension(project);
    const app = project.getFirstTarget();
    assert.equal(unquote(app.firstTarget.name), 'Ghostex');
    assert.equal(app.firstTarget.dependencies.length, 1, 'the app depends on the extension');
  });

  test('the target an earlier plugin version created is brought to the current lists, not left or duplicated', async () => {
    const previous = readProject(APP_PROJECT);
    const previousUuid = withPreviousExtension(previous);
    // As `pod install` (Xcodeproj) writes the project after a prebuild: the target's name without quotes.
    const project = await prebuild(readProject(previous.writeSync().replaceAll(`"${TARGET}"`, TARGET)));
    const extension = assertCurrentExtension(project);
    assert.equal(extension.targetUuid, previousUuid, 'the existing target is kept');
    assert.equal(project.getFirstTarget().firstTarget.dependencies.length, 1, 'still one dependency');
  });

  test('running prebuild again changes nothing the extension has', async () => {
    const once = await prebuild(readProject(APP_PROJECT));
    const twice = await prebuild(readProject(once.writeSync()));
    const { targetUuid, ...current } = assertCurrentExtension(twice);
    const { targetUuid: firstUuid, ...first } = extensionOf(once);
    assert.equal(targetUuid, firstUuid);
    assert.deepEqual(current, first);
    for (const section of ['PBXBuildFile', 'PBXFileReference', 'PBXGroup', 'PBXNativeTarget']) {
      const [onceCount, twiceCount] = [once, twice].map(
        (project) =>
          Object.keys(project.hash.project.objects[section]).filter((key) => !key.endsWith('_comment')).length,
      );
      assert.equal(twiceCount, onceCount, section);
    }
  });
});
