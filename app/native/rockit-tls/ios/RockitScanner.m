// A full-screen QR scanner for the pairing code on the Umbrel page.
//
// Apple's own camera framework (AVFoundation), no third-party code. The camera
// runs only while the scanner is open, nothing is recorded or kept, and the
// result is just the text in the QR code.

#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

@interface RockitScannerController : UIViewController <AVCaptureMetadataOutputObjectsDelegate>
@property (nonatomic, copy) void (^done)(NSString *text);
@end

@implementation RockitScannerController {
  AVCaptureSession *_session;
  AVCaptureVideoPreviewLayer *_preview;
  BOOL _finished;
}

- (void)viewDidLoad
{
  [super viewDidLoad];
  self.view.backgroundColor = [UIColor colorWithRed:0x14 / 255.0 green:0x16 / 255.0 blue:0x1C / 255.0 alpha:1];

  _session = [AVCaptureSession new];
  AVCaptureDevice *camera = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
  AVCaptureDeviceInput *input = camera ? [AVCaptureDeviceInput deviceInputWithDevice:camera error:nil] : nil;
  AVCaptureMetadataOutput *output = [AVCaptureMetadataOutput new];
  if (input && [_session canAddInput:input] && [_session canAddOutput:output]) {
    [_session addInput:input];
    [_session addOutput:output];
    [output setMetadataObjectsDelegate:self queue:dispatch_get_main_queue()];
    output.metadataObjectTypes = @[ AVMetadataObjectTypeQRCode ];
    _preview = [AVCaptureVideoPreviewLayer layerWithSession:_session];
    _preview.videoGravity = AVLayerVideoGravityResizeAspectFill;
    [self.view.layer addSublayer:_preview];
  }

  UIColor *gold = [UIColor colorWithRed:0xD4 / 255.0 green:0xA6 / 255.0 blue:0x57 / 255.0 alpha:1];

  UIView *frame = [UIView new];
  frame.translatesAutoresizingMaskIntoConstraints = NO;
  frame.layer.borderColor = gold.CGColor;
  frame.layer.borderWidth = 2;
  frame.layer.cornerRadius = 20;
  frame.userInteractionEnabled = NO;
  [self.view addSubview:frame];

  UILabel *hint = [UILabel new];
  hint.translatesAutoresizingMaskIntoConstraints = NO;
  hint.text = @"Point at the QR code on your Umbrel's Rock it page";
  hint.textColor = [UIColor colorWithRed:0xF2 / 255.0 green:0xEF / 255.0 blue:0xE8 / 255.0 alpha:1];
  hint.font = [UIFont systemFontOfSize:16 weight:UIFontWeightMedium];
  hint.textAlignment = NSTextAlignmentCenter;
  hint.numberOfLines = 0;
  [self.view addSubview:hint];

  UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem];
  cancel.translatesAutoresizingMaskIntoConstraints = NO;
  [cancel setTitle:@"Cancel" forState:UIControlStateNormal];
  [cancel setTitleColor:gold forState:UIControlStateNormal];
  cancel.titleLabel.font = [UIFont systemFontOfSize:17 weight:UIFontWeightSemibold];
  [cancel addTarget:self action:@selector(cancel) forControlEvents:UIControlEventTouchUpInside];
  [self.view addSubview:cancel];

  UILayoutGuide *safe = self.view.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [frame.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
    [frame.centerYAnchor constraintEqualToAnchor:self.view.centerYAnchor],
    [frame.widthAnchor constraintEqualToConstant:240],
    [frame.heightAnchor constraintEqualToConstant:240],
    [hint.leadingAnchor constraintEqualToAnchor:safe.leadingAnchor constant:24],
    [hint.trailingAnchor constraintEqualToAnchor:safe.trailingAnchor constant:-24],
    [hint.bottomAnchor constraintEqualToAnchor:frame.topAnchor constant:-24],
    [cancel.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
    [cancel.bottomAnchor constraintEqualToAnchor:safe.bottomAnchor constant:-24],
  ]];
}

- (void)viewDidLayoutSubviews
{
  [super viewDidLayoutSubviews];
  _preview.frame = self.view.bounds;
}

- (void)viewWillAppear:(BOOL)animated
{
  [super viewWillAppear:animated];
  AVCaptureSession *session = _session;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    [session startRunning];
  });
}

- (void)viewWillDisappear:(BOOL)animated
{
  [super viewWillDisappear:animated];
  AVCaptureSession *session = _session;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    [session stopRunning];
  });
}

- (void)captureOutput:(AVCaptureOutput *)output
    didOutputMetadataObjects:(NSArray<__kindof AVMetadataObject *> *)objects
              fromConnection:(AVCaptureConnection *)connection
{
  for (AVMetadataObject *object in objects) {
    if ([object isKindOfClass:[AVMetadataMachineReadableCodeObject class]]) {
      NSString *text = ((AVMetadataMachineReadableCodeObject *)object).stringValue;
      if (text.length > 0) {
        [self finish:text];
        return;
      }
    }
  }
}

- (void)cancel
{
  [self finish:nil];
}

- (void)finish:(NSString *)text
{
  if (_finished) {
    return;
  }
  _finished = YES;
  void (^done)(NSString *) = self.done;
  [self dismissViewControllerAnimated:YES
                           completion:^{
                             if (done) {
                               done(text);
                             }
                           }];
}

@end

@interface RockitScanner : NSObject <RCTBridgeModule>
@end

@implementation RockitScanner

RCT_EXPORT_MODULE(RockitScanner)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

// scan() -> the text in the QR code, or null when cancelled. Rejects with
// "nocamera" (no camera, e.g. the Simulator) or "denied" (camera access off).
RCT_EXPORT_METHOD(scan : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  if ([AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo] == nil) {
    reject(@"nocamera", @"This device has no camera.", nil);
    return;
  }
  void (^present)(void) = ^{
    UIViewController *top = RCTPresentedViewController();
    if (top == nil) {
      reject(@"nocamera", @"The scanner could not open.", nil);
      return;
    }
    RockitScannerController *scanner = [RockitScannerController new];
    scanner.modalPresentationStyle = UIModalPresentationFullScreen;
    scanner.done = ^(NSString *text) {
      resolve(text ?: [NSNull null]);
    };
    [top presentViewController:scanner animated:YES completion:nil];
  };
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
  if (status == AVAuthorizationStatusAuthorized) {
    present();
  } else if (status == AVAuthorizationStatusNotDetermined) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                             completionHandler:^(BOOL granted) {
                               dispatch_async(dispatch_get_main_queue(), ^{
                                 if (granted) {
                                   present();
                                 } else {
                                   reject(@"denied", @"Camera access is off.", nil);
                                 }
                               });
                             }];
  } else {
    reject(@"denied", @"Camera access is off.", nil);
  }
}

@end
