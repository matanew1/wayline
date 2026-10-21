require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
repo_url = (package['repository'].is_a?(Hash) ? package['repository']['url'] : package['repository']) ||
           'https://github.com/g4rb4g3/react-native-carplay'

Pod::Spec.new do |s|
  s.name         = 'react-native-carplay'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = repo_url
  s.license      = package['license']
  s.authors      = package['author'] || 'react-native-carplay contributors'
  s.ios.deployment_target = '15.1'
  s.source       = { :git => repo_url }
  s.source_files = "ios/*.{h,m,mm,swift}"
  s.frameworks   = 'CarPlay'
  # mixed Swift/ObjC pod: ObjC imports the generated <module>-Swift.h
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }

  # React Native 0.88 (New Architecture): pulls in React-Core and friends the way RN expects;
  # this is a legacy-interop module (RCTBridgeModule / RCTEventEmitter), no codegen.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
  end
end
