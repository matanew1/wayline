#import <Foundation/Foundation.h>
#import <CarPlay/CarPlay.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import "RCTConvert+RNCarPlay.h"
#import "RNCPStore.h"

typedef void(^SearchResultUpdateBlock)(NSArray<CPListItem *> * _Nonnull);
typedef void(^SelectedResultBlock)(void);

@interface RNCarPlay : RCTEventEmitter<RCTBridgeModule, CPInterfaceControllerDelegate, CPSearchTemplateDelegate, CPListTemplateDelegate, CPMapTemplateDelegate,  CPTabBarTemplateDelegate, CPPointOfInterestTemplateDelegate, CPNowPlayingTemplateObserver> {
    SearchResultUpdateBlock searchResultBlock;
    SelectedResultBlock selectedResultBlock;
    BOOL isNowPlayingActive;
}

@property (nonatomic, retain) CPInterfaceController * _Nullable interfaceController;
@property (nonatomic, retain) CPWindow * _Nullable window;
@property (nonatomic, copy) SearchResultUpdateBlock _Nullable searchResultBlock;
@property (nonatomic, copy) SelectedResultBlock _Nullable selectedResultBlock;
@property (nonatomic) BOOL isNowPlayingActive;

/// Bridgeless React Native: creates the React root view for a CarPlay scene (window, dashboard, cluster).
/// Call before connecting, typically with the app's RCTReactNativeFactory.rootViewFactory.
+ (void) setRootViewFactory:(UIView *_Nonnull (^_Nullable)(NSString *_Nonnull moduleName, NSDictionary *_Nonnull initialProperties))factory;
+ (void) connectWithInterfaceController:(CPInterfaceController*_Nullable)interfaceController window:(CPWindow*_Nonnull)window;
+ (void) disconnect;
+ (void) stateChanged:(BOOL)isVisible;

+ (void) connectWithDashboardController:(CPDashboardController*_Nonnull)dashboardController window:(UIWindow*_Nonnull)window;
+ (void) disconnectFromDashbaordController;
+ (void) dashboardStateChanged:(BOOL)isVisible;

+ (void) connectWithInstrumentClusterController:(CPInstrumentClusterController *_Nonnull)instrumentClusterController contentStyle:(UIUserInterfaceStyle)contentStyle clusterId:(NSString *_Nonnull)clusterId API_AVAILABLE(ios(15.4));
+ (void) clusterContentStyleDidChange:(UIUserInterfaceStyle)contentStyle clusterId:(NSString *_Nonnull)clusterId API_AVAILABLE(ios(15.4));
+ (void) disconnectFromInstrumentClusterController:(NSString *_Nonnull)clusterId;
+ (void) clusterStateChanged:(NSString *_Nonnull)clusterId isVisible:(BOOL)isVisible;

@end
