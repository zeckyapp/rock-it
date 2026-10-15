require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RockitTls"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://zecky.app"
  s.license      = package["license"]
  s.authors      = "Zecky"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/zeckyapp/rock-it.git", :tag => "v#{s.version}" }
  s.source_files = "ios/**/*.{h,m}"
  s.frameworks   = "Security"

  install_modules_dependencies(s)
end
