// HTTPS to the Rock that trusts only the Rock's own certificate.
//
// The Rock makes a self-signed certificate on first start, and the QR code on
// its page carries the certificate's SHA-256 fingerprint (base64url). Here the
// usual certificate checks are replaced by one: the server's certificate must
// have that fingerprint. Anyone else on the network, even with a certificate
// from a real authority, is refused.
//
// An empty pin accepts any certificate and reports its fingerprint. The app
// only does that once, to pair after a code was typed by hand, and then keeps
// the fingerprint it saw.

#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <Security/Security.h>

@interface RockitTlsDelegate : NSObject <NSURLSessionDelegate>
@property (nonatomic, copy) NSString *pin;
@property (nonatomic, copy) NSString *seen;
@property (nonatomic) BOOL refused;
@end

static NSString *Base64Url(NSData *data)
{
  NSString *b64 = [data base64EncodedStringWithOptions:0];
  b64 = [b64 stringByReplacingOccurrencesOfString:@"+" withString:@"-"];
  b64 = [b64 stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
  return [b64 stringByReplacingOccurrencesOfString:@"=" withString:@""];
}

static NSString *Fingerprint(SecTrustRef trust)
{
  CFArrayRef chain = SecTrustCopyCertificateChain(trust);
  if (chain == NULL) {
    return nil;
  }
  NSString *result = nil;
  if (CFArrayGetCount(chain) > 0) {
    SecCertificateRef leaf = (SecCertificateRef)CFArrayGetValueAtIndex(chain, 0);
    NSData *der = (__bridge_transfer NSData *)SecCertificateCopyData(leaf);
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(der.bytes, (CC_LONG)der.length, digest);
    result = Base64Url([NSData dataWithBytes:digest length:sizeof(digest)]);
  }
  CFRelease(chain);
  return result;
}

@implementation RockitTlsDelegate

- (void)URLSession:(NSURLSession *)session
    didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge
      completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *))completionHandler
{
  NSURLProtectionSpace *space = challenge.protectionSpace;
  if (![space.authenticationMethod isEqualToString:NSURLAuthenticationMethodServerTrust]) {
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
    return;
  }
  SecTrustRef trust = space.serverTrust;
  NSString *seen = trust ? Fingerprint(trust) : nil;
  self.seen = seen;
  BOOL ok = seen != nil && (self.pin.length == 0 || [self.pin isEqualToString:seen]);
  if (!ok) {
    self.refused = YES;
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
    return;
  }
  completionHandler(NSURLSessionAuthChallengeUseCredential, [NSURLCredential credentialForTrust:trust]);
}

@end

@interface RockitTls : NSObject <RCTBridgeModule>
@end

@implementation RockitTls

RCT_EXPORT_MODULE(RockitTls)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// request(url, method, headers, body, pin, timeoutMs) ->
//   { status, body, pin } where pin is the fingerprint the server showed.
// Rejects with code "pin" when the certificate is not the expected one, and
// "unreachable" when there is no answer.
RCT_EXPORT_METHOD(request : (NSString *)urlString
                  method : (NSString *)method
                  headers : (NSDictionary *)headers
                  body : (NSString *)body
                  pin : (NSString *)pin
                  timeoutMs : (nonnull NSNumber *)timeoutMs
                  resolve : (RCTPromiseResolveBlock)resolve
                  reject : (RCTPromiseRejectBlock)reject)
{
  NSURL *url = [NSURL URLWithString:urlString];
  if (url == nil || ![url.scheme isEqualToString:@"https"]) {
    reject(@"url", @"Only https addresses.", nil);
    return;
  }

  NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
  NSTimeInterval timeout = MAX(timeoutMs.doubleValue / 1000.0, 1.0);
  config.timeoutIntervalForRequest = timeout;
  config.timeoutIntervalForResource = timeout;
  config.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
  config.URLCache = nil;
  config.HTTPCookieStorage = nil;
  config.HTTPShouldSetCookies = NO;

  RockitTlsDelegate *delegate = [RockitTlsDelegate new];
  delegate.pin = pin ?: @"";
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config delegate:delegate delegateQueue:nil];

  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
  req.HTTPMethod = method.length > 0 ? method : @"GET";
  [headers enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL *stop) {
    if ([key isKindOfClass:[NSString class]] && [value isKindOfClass:[NSString class]]) {
      [req setValue:value forHTTPHeaderField:key];
    }
  }];
  if (body.length > 0) {
    req.HTTPBody = [body dataUsingEncoding:NSUTF8StringEncoding];
  }

  NSURLSessionDataTask *task = [session
      dataTaskWithRequest:req
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
          [session finishTasksAndInvalidate];
          if (delegate.refused) {
            reject(@"pin", @"The Rock's certificate does not match.", nil);
            return;
          }
          if (error != nil || ![response isKindOfClass:[NSHTTPURLResponse class]]) {
            reject(@"unreachable", error.localizedDescription ?: @"No answer.", error);
            return;
          }
          NSString *text = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"";
          resolve(@{
            @"status" : @(((NSHTTPURLResponse *)response).statusCode),
            @"body" : text ?: @"",
            @"pin" : delegate.seen ?: @"",
          });
        }];
  [task resume];
}

@end
