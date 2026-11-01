// swift-tools-version:5.9
// The test target for the 4 KB budget: the shared attributes and content state (the same files the
// app module and the widget extension compile) under XCTest, run in an iOS simulator:
//   xcodebuild test -scheme GhostexLiveActivityModel -destination 'platform=iOS Simulator,name=<iPhone>'
// Not part of the app build: CocoaPods and the extension target list their files explicitly.
import PackageDescription

let package = Package(
  name: "GhostexLiveActivityModel",
  platforms: [.iOS("16.4")],
  products: [
    .library(name: "GhostexLiveActivityModel", targets: ["GhostexLiveActivityModel"])
  ],
  targets: [
    .target(name: "GhostexLiveActivityModel", path: "Shared"),
    // The extension's views and agent marks, so their rules are testable too (the minimal counts,
    // the agent mark resolver). Without the widget entry point (`@main`) and the asset catalog.
    .target(
      name: "GhostexLiveActivityViews",
      dependencies: ["GhostexLiveActivityModel"],
      path: "Extension",
      exclude: ["GhostexLiveActivityWidget.swift", "Assets.xcassets"]
    ),
    .testTarget(
      name: "GhostexLiveActivityModelTests",
      dependencies: ["GhostexLiveActivityModel", "GhostexLiveActivityViews"],
      path: "Tests"
    ),
  ]
)
