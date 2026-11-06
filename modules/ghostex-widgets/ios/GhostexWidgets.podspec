Pod::Spec.new do |s|
  s.name           = 'GhostexWidgets'
  s.version        = '1.0.0'
  s.summary        = 'Ghostex Home Screen widgets (WidgetKit) for iOS'
  s.description    = 'Expo local module that writes the Ghostex widget snapshot into the App Group and reloads the widgets; the widgets are in the widget extension plugins/withWidgets.js adds.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'GPL-3.0' }
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # The app side only: the module and where the snapshot lives. Extension/ is compiled by the widget extension target.
  s.source_files = ['GhostexWidgetsModule.swift', 'Shared/**/*.swift']
  s.frameworks = 'WidgetKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
