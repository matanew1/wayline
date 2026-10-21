require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-carplay'
  s.version      = package['version']
  s.summary      = package['description']

  s.homepage     = package['repository']['url']

  s.license      = package['license']
  s.authors      = package['author']
  s.ios.deployment_target = '12.0'

  s.source       = { :git => "https://github.com/g4rb4g3/react-native-carplay.git" }

  s.source_files  = "ios/*.{h,m,swift}"

  s.dependency 'React'
end
